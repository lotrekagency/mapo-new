/**
 * `run`, the operation: the provider and model of a request, the user's
 * permission on the record's model, what the AI is asked, the prompt in
 * layers, the call within the provider's time, and the answer read against
 * what was asked, with the audit of the call. Its dependencies are passed
 * in, and `nitro.ts` wires them to the server, so a test or other server
 * code runs it without the route.
 *
 * The order keeps what costs for last: a request refused by the policy, the
 * permissions or the contract never counts against the user's limit, and
 * only a call that reached the provider is audited.
 */

import { createError } from "h3";
import type { H3Event } from "h3";
import type { AiContract } from "../../shared/contract";
import type {
  MapoAiRunEntity,
  MapoAiRunRequest,
  MapoAiRunResponse,
  MapoAiUsage,
} from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import {
  sanitizeExtractAnswer,
  sanitizeFillAnswer,
} from "../../shared/sanitize";
import { requireModelPermission } from "../auth/nitro";
import type { MapoAiSession } from "../auth/nitro";
import type { MapoAiModelAction, MapoAiUser } from "../auth/user";
import { composeMapoAiPrompt } from "../prompts/compose";
import { MapoAiProviderError } from "../providers/types";
import type {
  MapoAiProviderFailure,
  MapoAiProviderRequest,
} from "../providers/types";
import type { PurposeStore } from "../storage/sealed";
import { AUDIT_RECORD_VERSION, writeAudit } from "./audit";
import type { MapoAiAuditOutcome, MapoAiAuditRecord } from "./audit";
import { contractOf } from "./contract";
import type { LimitOutcome, RateLimiter } from "./limiter";
import { chooseProvider } from "./policy";
import type { MapoAiPolicy, UsableProvider } from "./policy";

/** An entity of the request, as the `mapo-ai:prompt` hooks see it: no schemas. */
export interface MapoAiPromptEntity {
  /** Its type in an extraction, such as `event`. */
  readonly type?: string;
  /** Its name for people. */
  readonly label?: string;
  /** Where its records are created. */
  readonly endpoint?: string;
  /** The backend model of its records. */
  readonly model?: string;
}

/**
 * What the `mapo-ai:prompt` hook receives, once the request is let in and
 * before the AI is called. A hook adds the app's rules for this request,
 * after `mapo.ai.instructions`; it cannot remove a rule, Mapo's or another
 * hook's, nor change the shape of the answer.
 */
export interface MapoAiPromptContext {
  /** The request. */
  readonly event: H3Event;
  /** Who asks, as the gateway reads them. */
  readonly user: MapoAiUser;
  /** Whether they administer the AI. */
  readonly admin: boolean;
  /** `fill` for one record, `extract` for every record of a source. */
  readonly task: MapoAiRunRequest["task"];
  /** The entities of the request. */
  readonly entities: readonly MapoAiPromptEntity[];
  /** Adds one of the app's rules to this request's prompt. Blank text adds nothing. */
  addRule(rule: string): void;
}

/** What {@link runMapoAi} needs from the server. */
export interface RunDependencies {
  policy: MapoAiPolicy;
  /** The storage's `audit` purpose. */
  audit: PurposeStore;
  limiter: RateLimiter;
  /** The rules the app's `mapo-ai:prompt` hooks add for this request. */
  promptRules(
    facts: Omit<MapoAiPromptContext, "event" | "addRule">,
  ): Promise<string[]>;
  /** The clock, in milliseconds. Default `Date.now`. */
  now?: () => number;
}

const NO_USAGE: MapoAiUsage = { inputTokens: 0, outputTokens: 0 };

/** The longest wait a provider may ask, in seconds. */
const MAX_RETRY_AFTER = 3600;

/** What the gateway answers for each failure of a provider. */
const FAILURES: Record<
  MapoAiProviderFailure | "error",
  { statusCode: number; statusMessage: string }
> = {
  timeout: { statusCode: 504, statusMessage: "The AI did not answer in time" },
  "rate-limit": {
    statusCode: 503,
    statusMessage: "The AI provider is busy: try again later",
  },
  unavailable: { statusCode: 502, statusMessage: "The AI provider failed" },
  "invalid-response": {
    statusCode: 502,
    statusMessage: "The AI provider's response could not be read",
  },
  "refused-request": {
    statusCode: 502,
    statusMessage: "The AI provider refused the request",
  },
  "too-long": {
    statusCode: 413,
    statusMessage: "The source is too long for this AI model",
  },
  truncated: {
    statusCode: 502,
    statusMessage:
      "The AI's answer was cut off: it reached the most the model may write",
  },
  error: { statusCode: 502, statusMessage: "The AI provider failed" },
};

/**
 * Runs a request of `run` for the user of `session`.
 * @throws H3Error 403 (provider, model or permission), 413 (a prompt the
 *   model cannot read whole), 422 (nothing to ask), 429 (the user's limit,
 *   with `data.retryAfter`), 503 (no provider; the provider busy, with
 *   `data.retryAfter` when it says), 502, 504. A failure of the provider
 *   names itself in `data.failure`.
 */
export async function runMapoAi(
  session: MapoAiSession,
  request: MapoAiRunRequest,
  deps: RunDependencies,
): Promise<MapoAiRunResponse> {
  const now = deps.now ?? Date.now;
  const { options } = deps.policy;
  const { usable, model } = chooseProvider(
    deps.policy,
    request.task,
    request.provider,
  );
  for (const { entity, action } of permissionsOf(request)) {
    requireModelPermission(session, entity.model, action);
  }
  // A user past the limit is refused before the contract and the hooks
  // cost anything; the call counts only once they have passed.
  const perMinute = options.limits.perUserPerMinute;
  refuseOverLimit(deps.limiter.peek(session.user.id, perMinute));
  const contract = contractOf(request);
  const entities =
    request.task === "fill" ? [request.entity] : request.entities;
  const described = entities.map(describedEntity);
  const hookRules = await deps.promptRules({
    user: session.user,
    admin: session.admin,
    task: request.task,
    entities: described,
  });

  refuseOverLimit(deps.limiter.take(session.user.id, perMinute));

  const prompt = composeMapoAiPrompt({
    contract,
    parts: request.parts,
    app: [
      options.instructions.all,
      options.instructions[request.task],
      ...hookRules,
    ],
    ...(request.instructions ? { operator: request.instructions } : {}),
  });
  const provider = { id: usable.provider.id, model };
  const started = now();
  const audit = (
    outcome: MapoAiAuditOutcome,
    usage: MapoAiUsage,
    failure?: MapoAiAuditRecord["failure"],
  ) =>
    writeAuditSafely(deps.audit, {
      record: {
        v: AUDIT_RECORD_VERSION,
        at: new Date(started).toISOString(),
        user: {
          id: session.user.id,
          ...(session.user.username !== undefined
            ? { username: session.user.username }
            : {}),
        },
        task: request.task,
        entities: described.map((entity) => ({ ...entity })),
        provider,
        prompt: prompt.version,
        usage,
        outcome,
        ...(failure ? { failure } : {}),
        durationMs: Math.max(0, now() - started),
      },
      at: started,
      retentionDays: options.audit.retentionDays,
      now: now(),
    });

  let answer: ProviderAnswer;
  try {
    // The provider gets copies: what it does to them never changes what its
    // answer is read against.
    const asked = structuredClone(contract);
    answer = await callProvider(usable, {
      task: request.task,
      model,
      prompt,
      parts: structuredClone(request.parts),
      schema: asked.schema,
      contract: asked,
    });
  } catch (error) {
    const failure = failureOf(error);
    console.error(
      `[mapo-ai] The provider "${provider.id}" (${provider.model}) failed: ${describe(error)}`,
    );
    await audit("failed", NO_USAGE, failure);
    // Only a busy provider says when to try again: a provider that is down
    // or failed has no time to give.
    const retryAfter =
      failure === "rate-limit" ? retryAfterOf(error) : undefined;
    throw createError({
      ...FAILURES[failure],
      data: { failure, ...(retryAfter !== undefined ? { retryAfter } : {}) },
    });
  }

  // The call is made and paid for: it is audited before its answer is read.
  await audit(answer.status, answer.usage);
  const base = { provider, prompt: prompt.version, usage: answer.usage };
  if (answer.status === "refused") {
    return {
      task: request.task,
      status: "refused",
      refusal: answer.refusal,
      ...base,
    };
  }
  const response = answered(contract, answer.output, request, deps.policy);
  return { ...response, ...base };
}

/** @throws H3Error 429, with `data.retryAfter`, when the limit refuses the call */
function refuseOverLimit(outcome: LimitOutcome): void {
  if (outcome.allowed) return;
  throw createError({
    statusCode: 429,
    statusMessage: "Too many calls to the AI: try again in a minute",
    data: { retryAfter: outcome.retryAfter },
  });
}

/** The answer read against the contract, with the app's verification rules. */
function answered(
  contract: AiContract,
  output: unknown,
  request: MapoAiRunRequest,
  policy: MapoAiPolicy,
):
  | {
      task: "fill";
      status: "answered";
      result: ReturnType<typeof sanitizeFillAnswer>;
    }
  | {
      task: "extract";
      status: "answered";
      result: ReturnType<typeof sanitizeExtractAnswer>;
    } {
  const options = {
    source: request.parts.map((part) => part.text).join("\n\n"),
    rules: policy.options.verification,
  };
  return contract.task === "fill"
    ? {
        task: "fill",
        status: "answered",
        result: sanitizeFillAnswer(contract, output, options),
      }
    : {
        task: "extract",
        status: "answered",
        result: sanitizeExtractAnswer(contract, output, options),
      };
}

/** The permission each entity asks: `change_` to fill a record that exists, `add_` otherwise. */
function permissionsOf(
  request: MapoAiRunRequest,
): { entity: MapoAiRunEntity; action: MapoAiModelAction }[] {
  if (request.task === "fill") {
    const action = request.existing === true ? "change" : "add";
    return [{ entity: request.entity, action }];
  }
  return request.entities.map((entity) => ({ entity, action: "add" }));
}

/** An entity as the hooks and the audit see it: its names and endpoint, never its schemas. */
function describedEntity(entity: MapoAiRunEntity): MapoAiPromptEntity {
  return Object.freeze({
    ...(entity.type !== undefined ? { type: entity.type } : {}),
    ...(entity.label !== undefined ? { label: entity.label } : {}),
    ...(entity.endpoint !== undefined ? { endpoint: entity.endpoint } : {}),
    ...(entity.model !== undefined ? { model: entity.model } : {}),
  });
}

/** A provider's answer, read as outside data. */
type ProviderAnswer =
  | { status: "answered"; output: unknown; usage: MapoAiUsage }
  | { status: "refused"; refusal: string; usage: MapoAiUsage };

/**
 * Calls the provider, within its time. When the time is up the gateway
 * stops waiting, whether or not the provider heeds the signal; what the
 * call does later is not heard.
 * @throws MapoAiProviderError `timeout` when the time is up; the provider's
 *   error otherwise, or `invalid-response` for an answer of no known shape
 */
async function callProvider(
  usable: UsableProvider,
  request: Omit<MapoAiProviderRequest, "signal">,
): Promise<ProviderAnswer> {
  const controller = new AbortController();
  const seconds = usable.timeoutMs / 1000;
  const timeUp = new MapoAiProviderError(
    "timeout",
    `no answer in ${seconds} seconds`,
  );
  const timer = setTimeout(() => controller.abort(timeUp), usable.timeoutMs);
  const call = Promise.resolve().then(() =>
    usable.provider.run({ ...request, signal: controller.signal }),
  );
  call.catch(() => undefined);
  const stopped = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(controller.signal.reason),
      { once: true },
    );
  });
  stopped.catch(() => undefined);
  try {
    return providerAnswerOf(await Promise.race([call, stopped]));
  } catch (error) {
    throw controller.signal.aborted ? timeUp : error;
  } finally {
    clearTimeout(timer);
  }
}

/** What a provider returned, which may be an app's code: checked, never cast. */
function providerAnswerOf(value: unknown): ProviderAnswer {
  const answer = isRecord(value) ? value : {};
  const usage = usageOf(answer.usage);
  if (answer.status === "answered" && Object.hasOwn(answer, "output")) {
    return { status: "answered", output: plainJson(answer.output), usage };
  }
  if (answer.status === "refused" && typeof answer.refusal === "string") {
    return { status: "refused", refusal: answer.refusal, usage };
  }
  throw new MapoAiProviderError(
    "invalid-response",
    "the provider returned no answer and no refusal",
  );
}

/**
 * The answer as plain JSON, as a provider's API sends it: no getters, no
 * prototypes, no cycles; `undefined` when it has no JSON form, which the
 * sanitizer reads as unreadable.
 */
function plainJson(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return undefined;
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/** Token counts as whole numbers from zero; anything else counts as zero. */
function usageOf(value: unknown): MapoAiUsage {
  const usage = isRecord(value) ? value : {};
  const count = (given: unknown) =>
    Number.isInteger(given) && Number(given) >= 0 ? Number(given) : 0;
  return {
    inputTokens: count(usage.inputTokens),
    outputTokens: count(usage.outputTokens),
  };
}

/** The failure a provider's error names, when it is one the gateway knows; `error` otherwise. */
function failureOf(error: unknown): MapoAiProviderFailure | "error" {
  const failure: unknown =
    error instanceof MapoAiProviderError ? error.failure : undefined;
  return isFailure(failure) ? failure : "error";
}

function isFailure(value: unknown): value is MapoAiProviderFailure | "error" {
  return typeof value === "string" && Object.hasOwn(FAILURES, value);
}

/** The seconds a busy provider asks to wait: a finite count from zero, at most an hour. */
function retryAfterOf(error: unknown): number | undefined {
  const seconds: unknown =
    error instanceof MapoAiProviderError ? error.retryAfter : undefined;
  const isUsable =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
  return isUsable ? Math.min(Math.ceil(seconds), MAX_RETRY_AFTER) : undefined;
}

/** An error, for the server's log: one line, a few hundred characters at most. */
function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Writes the audit record. A failure to write is logged, not answered: the
 * call has been made and paid for, and its answer still reaches the user.
 */
async function writeAuditSafely(
  store: PurposeStore,
  entry: {
    record: MapoAiAuditRecord;
    at: number;
    retentionDays: number;
    now: number;
  },
): Promise<void> {
  try {
    await writeAudit(store, entry.record, entry);
  } catch (error) {
    console.error(
      `[mapo-ai] The audit record of a call could not be written: ${describe(error)}`,
    );
  }
}

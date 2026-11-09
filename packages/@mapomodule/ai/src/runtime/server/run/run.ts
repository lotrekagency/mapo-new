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
 * only a call that reached the provider is audited. A call stops when the
 * page that asked goes away. The preview of a call, "What I send to the
 * AI", runs the same checks and composes the same prompt, and stops there.
 */

import { createError } from "h3";
import type { H3Event } from "h3";
import type { AiContract } from "../../shared/contract";
import type {
  MapoAiPreviewEntity,
  MapoAiRunEntity,
  MapoAiRunPreviewResponse,
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
import { composeMapoAiPrompt, operatorLayer } from "../prompts/compose";
import type { MapoAiPrompt } from "../prompts/compose";
import { MapoAiProviderError } from "../providers/types";
import type {
  MapoAiProviderFailure,
  MapoAiProviderRequest,
} from "../providers/types";
import type { PurposeStore } from "../storage/sealed";
import { AUDIT_RECORD_VERSION, writeAudit } from "./audit";
import type {
  MapoAiAuditFailure,
  MapoAiAuditOutcome,
  MapoAiAuditRecord,
} from "./audit";
import { compiledOf } from "./contract";
import type { CompiledRequest } from "./contract";
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
  /**
   * Whether the request is a preview of the call, "What I send to the AI"
   * (`run/preview`): the prompt is shown to the operator, and no provider
   * is called. A rule a hook adds is shown as it would be sent.
   */
  readonly preview: boolean;
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

/** Options of {@link runMapoAi} for one request. */
export interface RunOptions {
  /**
   * Aborted when the page that asked goes away, closing its request: the
   * provider's call stops, so a model on the app's own server is free
   * again, and the audit says `cancelled`. A call that reached the
   * provider counts against the user's limit all the same.
   */
  signal?: AbortSignal;
}

/** What {@link previewMapoAiRun} needs from the server. */
export interface PreviewDependencies {
  policy: MapoAiPolicy;
  /** The previews' own counts: a preview never counts against `run`'s limit. */
  limiter: RateLimiter;
  /** Previews one user may ask in a minute. */
  perMinute: number;
  /** The rules the app's `mapo-ai:prompt` hooks add for this request. */
  promptRules: RunDependencies["promptRules"];
}

const NO_USAGE: MapoAiUsage = { inputTokens: 0, outputTokens: 0 };

/** The longest wait a provider may ask, in seconds. */
const MAX_RETRY_AFTER = 3600;
/** The longest name of a model a provider may say answered. */
const MAX_MODEL_ID = 200;

/**
 * What the gateway answers for each failure of a call. For `cancelled` no
 * one reads it: the page has gone away.
 */
const FAILURES: Record<
  MapoAiAuditFailure,
  { statusCode: number; statusMessage: string }
> = {
  cancelled: { statusCode: 499, statusMessage: "The call was cancelled" },
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
 *   with `data.retryAfter`), 503 (no provider; no key for the provider;
 *   the provider busy, with `data.retryAfter` when it says), 502, 504, and
 *   499 when the page went away (`run.signal`). A failure of the provider
 *   names itself in `data.failure`, as `cancelled` does.
 */
export async function runMapoAi(
  session: MapoAiSession,
  request: MapoAiRunRequest,
  deps: RunDependencies,
  run: RunOptions = {},
): Promise<MapoAiRunResponse> {
  const now = deps.now ?? Date.now;
  const { options } = deps.policy;
  const perMinute = options.limits.perUserPerMinute;
  // A user past the limit is refused before the contract and the hooks
  // cost anything; the call counts only once they have passed.
  const prepared = await prepareRun(session, request, deps, {
    peek: () => deps.limiter.peek(session.user.id, perMinute),
    preview: false,
  });
  // A page gone while the hooks ran asked for nothing: no count, no call.
  if (run.signal?.aborted) {
    throw createError({
      ...FAILURES.cancelled,
      data: { failure: "cancelled" },
    });
  }

  refuseOverLimit(deps.limiter.take(session.user.id, perMinute));

  const { usable, model, described } = prepared;
  const { contract } = prepared.compiled;
  const prompt = promptOf(prepared, request, options);
  const provider = { id: usable.provider.id, model };
  // Where the key comes from, for the audit: the level, never the key.
  const keyLevel = usable.key
    ? {
        level: usable.key.level,
        ...(usable.key.group !== undefined ? { group: usable.key.group } : {}),
      }
    : undefined;
  const started = now();
  const audit = (
    outcome: MapoAiAuditOutcome,
    usage: MapoAiUsage,
    failure?: MapoAiAuditRecord["failure"],
    by: MapoAiAuditRecord["provider"] = provider,
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
        provider: by,
        ...(keyLevel ? { key: keyLevel } : {}),
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
    answer = await callProvider(
      usable,
      {
        task: request.task,
        model,
        prompt,
        parts: structuredClone(request.parts),
        schema: asked.schema,
        contract: asked,
        ...(usable.apiKey !== undefined ? { apiKey: usable.apiKey } : {}),
      },
      run.signal,
    );
  } catch (error) {
    const failure = failureOf(error);
    // The operator stopped it: the audit says so, the log has nothing to fix.
    if (failure !== "cancelled") {
      console.error(
        `[mapo-ai] The provider "${provider.id}" (${provider.model}) failed: ${describe(error)}`,
      );
    }
    // A failed call may be paid: a cut answer is, up to its cap. The audit
    // keeps what the provider says it used, and the model that answered.
    const spent = error instanceof MapoAiProviderError ? error : undefined;
    const failedBy = modelOf(spent?.model);
    await audit(
      "failed",
      spent?.usage ? usageOf(spent.usage) : NO_USAGE,
      failure,
      failedBy ? { id: provider.id, model: failedBy } : provider,
    );
    // Only a busy provider says when to try again: a provider that is down
    // or failed has no time to give.
    const retryAfter =
      failure === "rate-limit" ? retryAfterOf(error) : undefined;
    throw createError({
      ...FAILURES[failure],
      data: { failure, ...(retryAfter !== undefined ? { retryAfter } : {}) },
    });
  }

  // The model that answered: another than the one asked when the provider
  // retried the call on it, at that model's prices.
  const by = answer.model ? { id: provider.id, model: answer.model } : provider;
  // The call is made and paid for: it is audited before its answer is read.
  await audit(answer.status, answer.usage, undefined, by);
  const base = { provider: by, prompt: prompt.version, usage: answer.usage };
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

/**
 * What `run` would send for a request, for "What I send to the AI": the
 * provider and model, layers 1–5 of the prompt, the parts of the source by
 * name and length, and what the AI is asked of each entity and leaves
 * alone. It checks and composes as `run` does, the app's
 * `mapo-ai:prompt` hooks included (they are told it is a preview); it
 * calls no provider, counts nothing against `run`'s limit and writes no
 * audit. Previews have a limit of their own, counted first.
 * @throws H3Error 403 (provider, model or permission), 422 (nothing to
 *   ask), 429 (past the previews' limit, with `data.retryAfter`), 503 (no
 *   provider)
 */
export async function previewMapoAiRun(
  session: MapoAiSession,
  request: MapoAiRunRequest,
  deps: PreviewDependencies,
): Promise<MapoAiRunPreviewResponse> {
  refuseOverLimit(deps.limiter.take(session.user.id, deps.perMinute));
  const prepared = await prepareRun(session, request, deps, {
    peek: () => ({ allowed: true }),
    preview: true,
  });
  const prompt = promptOf(prepared, request, deps.policy.options);
  const operator = operatorLayer(request.instructions);
  return {
    task: request.task,
    provider: { id: prepared.usable.provider.id, model: prepared.model },
    prompt: prompt.version,
    instructions: prompt.instructions,
    ...(operator.length ? { operator: operator.join("\n\n") } : {}),
    parts: request.parts.map((part) => ({
      ...(part.name !== undefined ? { name: part.name } : {}),
      chars: part.text.length,
    })),
    entities: previewEntities(prepared.compiled),
  };
}

/** A request let in, with what its prompt is composed from. */
interface PreparedRun {
  usable: UsableProvider;
  model: string;
  compiled: CompiledRequest;
  described: MapoAiPromptEntity[];
  hookRules: string[];
}

/**
 * What `run` and its preview share, in `run`'s order: the provider and the
 * model, the user's permission on the records' model, the user's limit
 * (looked at, `peek`), the contract and the app's hooks.
 */
async function prepareRun(
  session: MapoAiSession,
  request: MapoAiRunRequest,
  deps: Pick<RunDependencies, "policy" | "promptRules">,
  how: { peek: () => LimitOutcome; preview: boolean },
): Promise<PreparedRun> {
  const { options } = deps.policy;
  const { usable, model } = chooseProvider(
    deps.policy,
    request.task,
    request.provider,
  );
  for (const { entity, action } of permissionsOf(request)) {
    requireModelPermission(session, entity.model, action);
  }
  refuseOverLimit(how.peek());
  const compiled = compiledOf(request, { secretWords: options.secretWords });
  const entities =
    request.task === "fill" ? [request.entity] : request.entities;
  const described = entities.map(describedEntity);
  const hookRules = await deps.promptRules({
    user: session.user,
    admin: session.admin,
    task: request.task,
    entities: described,
    preview: how.preview,
  });
  return { usable, model, compiled, described, hookRules };
}

/** The prompt of a request let in: the app's rules, those its hooks added, the admins', the operator's. */
function promptOf(
  prepared: PreparedRun,
  request: MapoAiRunRequest,
  options: MapoAiPolicy["options"],
): MapoAiPrompt {
  return composeMapoAiPrompt({
    contract: prepared.compiled.contract,
    parts: request.parts,
    app: [
      options.instructions.all,
      options.instructions[request.task],
      ...prepared.hookRules,
    ],
    admin: [
      options.adminInstructions?.all ?? "",
      options.adminInstructions?.[request.task] ?? "",
    ],
    ...(request.instructions ? { operator: request.instructions } : {}),
  });
}

/** Each entity of a compiled request, as the preview shows it: its fields asked and left alone. */
function previewEntities({
  contract,
  sources,
}: CompiledRequest): MapoAiPreviewEntity[] {
  const entities =
    contract.task === "fill" ? [contract.entity] : contract.entities;
  return entities.map((entity) => {
    const source =
      contract.task === "fill"
        ? sources[0]
        : sources.find((one) => one.type === entity.type);
    const left = source?.entity.skipped ?? [];
    return {
      ...(entity.type !== undefined ? { type: entity.type } : {}),
      ...(entity.label !== undefined ? { label: entity.label } : {}),
      fields: entity.fields.map(({ key, label }) => ({
        key,
        ...(label !== undefined ? { label } : {}),
      })),
      skipped: [
        ...left.map(({ key, label, reason }) => ({
          key,
          ...(label !== undefined ? { label } : {}),
          reason,
        })),
        ...(entity.omitted ?? []).map(({ key, reason }) => ({ key, reason })),
      ],
    };
  });
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
  | { status: "answered"; output: unknown; usage: MapoAiUsage; model?: string }
  | { status: "refused"; refusal: string; usage: MapoAiUsage; model?: string };

/** Why a call stopped when the page that asked went away: the reason its signal carries. */
class CallCancelled extends Error {
  constructor() {
    super("the page that asked went away");
    this.name = "CallCancelled";
  }
}

/**
 * Calls the provider, within its time, until the page that asked goes
 * away (`cancel`). Either way the provider's signal is aborted and the
 * gateway stops waiting, whether or not the provider heeds the signal;
 * what the call does later is not heard.
 * @throws MapoAiProviderError `timeout` when the time is up; `CallCancelled`
 *   when the page went away; the provider's error otherwise, or
 *   `invalid-response` for an answer of no known shape
 */
async function callProvider(
  usable: UsableProvider,
  request: Omit<MapoAiProviderRequest, "signal">,
  cancel?: AbortSignal,
): Promise<ProviderAnswer> {
  const controller = new AbortController();
  const seconds = usable.timeoutMs / 1000;
  const timeUp = new MapoAiProviderError(
    "timeout",
    `no answer in ${seconds} seconds`,
  );
  const cancelled = new CallCancelled();
  const timer = setTimeout(() => controller.abort(timeUp), usable.timeoutMs);
  const onCancel = () => controller.abort(cancelled);
  if (cancel?.aborted) onCancel();
  else cancel?.addEventListener("abort", onCancel, { once: true });
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
    if (!controller.signal.aborted) throw error;
    throw controller.signal.reason === cancelled ? cancelled : timeUp;
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener("abort", onCancel);
  }
}

/** What a provider returned, which may be an app's code: checked, never cast. */
function providerAnswerOf(value: unknown): ProviderAnswer {
  const answer = isRecord(value) ? value : {};
  const usage = usageOf(answer.usage);
  const model = modelOf(answer.model);
  const by = model ? { model } : {};
  if (answer.status === "answered" && Object.hasOwn(answer, "output")) {
    return {
      status: "answered",
      output: plainJson(answer.output),
      usage,
      ...by,
    };
  }
  if (answer.status === "refused" && typeof answer.refusal === "string") {
    return { status: "refused", refusal: answer.refusal, usage, ...by };
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

/** A model's name a provider gave: text of up to 200 characters, not blank. */
function modelOf(value: unknown): string | undefined {
  const isModel =
    typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= MAX_MODEL_ID;
  return isModel ? value : undefined;
}

/**
 * Token counts as whole numbers from zero; anything else counts as zero.
 * The counts of the prompt cache, part of the prompt's, only when the
 * provider gives some.
 */
function usageOf(value: unknown): MapoAiUsage {
  const usage = isRecord(value) ? value : {};
  const count = (given: unknown) =>
    Number.isInteger(given) && Number(given) >= 0 ? Number(given) : 0;
  const read = count(usage.cacheReadTokens);
  const written = count(usage.cacheWriteTokens);
  return {
    inputTokens: count(usage.inputTokens),
    outputTokens: count(usage.outputTokens),
    ...(read > 0 ? { cacheReadTokens: read } : {}),
    ...(written > 0 ? { cacheWriteTokens: written } : {}),
  };
}

/**
 * Why a call failed: `cancelled` when the page went away; the failure a
 * provider's error names, when it is one the gateway knows; `error`
 * otherwise.
 */
function failureOf(error: unknown): MapoAiAuditFailure {
  if (error instanceof CallCancelled) return "cancelled";
  const failure: unknown =
    error instanceof MapoAiProviderError ? error.failure : undefined;
  return isProviderFailure(failure) ? failure : "error";
}

/** A failure a provider may name: `cancelled` and `error` are the gateway's. */
function isProviderFailure(value: unknown): value is MapoAiProviderFailure {
  const isKnown = typeof value === "string" && Object.hasOwn(FAILURES, value);
  const isGateways = value === "cancelled" || value === "error";
  return isKnown && !isGateways;
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

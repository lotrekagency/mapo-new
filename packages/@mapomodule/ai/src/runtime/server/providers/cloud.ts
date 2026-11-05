/**
 * What Mapo's providers for cloud models, `openai` and `anthropic`, share:
 * their addresses, the reasoning a call asks, the most an answer may write
 * with its reasoning, the key a call needs, the failures of a refused or
 * broken call, the call that leaves out the parameters a model does not
 * take, and the case of an enum's values. The memory of those parameters
 * is made by each provider.
 */

import type { JSONSchema } from "@mapomodule/utils";
import type { MapoAiUsage } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import {
  CONTEXT_REFUSAL,
  callServer,
  errorDetails,
  statusFailure,
} from "./http";
import type { ErrorDetails, ProviderServer } from "./http";
import { answerTokens } from "./local";
import { MapoAiProviderError } from "./types";
import type { MapoAiProviderRequest } from "./types";

/** Where OpenAI's API answers unless `baseURL` says otherwise. */
export const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";
/** Where Anthropic's API answers unless `baseURL` says otherwise. */
export const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com/v1";

/** How much a cloud model reasons before it answers. */
export type MapoAiEffort = "low" | "medium" | "high";
/** The efforts an app may ask: every current model of both providers takes them. */
export const MAPO_AI_EFFORTS: readonly MapoAiEffort[] = [
  "low",
  "medium",
  "high",
];
/**
 * The reasoning a call asks unless `effort` says otherwise: filling a form
 * from the quotes of a source is routine work, and the gateway checks every
 * value against its quote.
 */
export const DEFAULT_EFFORT: MapoAiEffort = "low";

/**
 * The room an answer keeps for the model's reasoning, which both providers
 * count within the most an answer may write: a model that runs out of it is
 * cut before it answers.
 */
const REASONING_TOKENS: Readonly<Record<MapoAiEffort, number>> = {
  low: 8192,
  medium: 16_384,
  high: 32_768,
};
/** How long a parameter a model refused is left out of its calls, in milliseconds. */
const DROPPED_MS = 10 * 60 * 1000;
/** How many models' refused parameters are kept, all servers together. */
const MAX_DROPPED = 200;
/** OpenAI's code for an account whose quota is used up: a matter of money, not of rate. */
const NO_CREDIT_CODES = new Set(["insufficient_quota"]);
/**
 * The words of a refusal for the account's money, OpenAI's and
 * Anthropic's. Anchored: the text of an ordinary rate limit may name
 * billing too, as for an account without a payment method.
 */
const NO_CREDIT = /exceeded your current quota|credit balance is too low/i;
/** The codes and types of a refusal for the model's context. */
const CONTEXT_CODES = new Set(["context_length_exceeded", "request_too_large"]);
/** OpenAI's codes for a parameter, or a value of one, that a model does not take. */
const UNSUPPORTED_CODES = new Set([
  "unsupported_parameter",
  "unknown_parameter",
  "unsupported_value",
]);
/** The longest name of a kind of error, or of a model, a log line repeats. */
const MAX_NAME = 80;

/**
 * The most a call lets the model write, its reasoning included: the
 * answer's room, which grows with the schema ({@link answerTokens}), and the
 * reasoning's, which grows with the effort. It bounds what a model that
 * loops inside a string value can cost.
 * @param schemaChars the characters of the answer's schema, as JSON
 */
export function cloudAnswerTokens(
  task: MapoAiProviderRequest["task"],
  schemaChars: number,
  effort: MapoAiEffort,
): number {
  return answerTokens(task, schemaChars) + REASONING_TOKENS[effort];
}

/**
 * Whether a call to `url` needs the app's key: a call to the provider's own
 * servers (`api.openai.com`, `eu.api.openai.com`, `api.anthropic.com`)
 * does; a call to another address, such as a proxy that adds its own key,
 * may go without.
 * @param domain the provider's domain: `openai.com`
 */
export function needsKey(url: string, domain: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true;
  }
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * The failure of a call made without the key its server needs: the log
 * says which variable of the environment holds it.
 */
export function missingKey(id: string, variable: string): MapoAiProviderError {
  return new MapoAiProviderError(
    "refused-request",
    `The provider "${id}" has no key: set ${variable} in the server's environment`,
  );
}

/**
 * The failure of a call its server refused: an account without credit is
 * `refused-request`, since waiting does not help; a rate limit
 * `rate-limit`, with its `Retry-After`; a prompt too long for the model's
 * context `too-long`; the rest as {@link statusFailure} reads the status.
 * The codes the error names come first, then its words.
 */
export function refusalOf(
  server: ProviderServer,
  request: Pick<MapoAiProviderRequest, "model">,
  response: Response,
  details: ErrorDetails,
): MapoAiProviderError {
  return (
    knownRefusal(server, request, response, details) ??
    statusFailure(response, details.message, server.name)
  );
}

/** A refusal for the money, the rate or the context; `undefined` for any other. */
function knownRefusal(
  server: ProviderServer,
  request: Pick<MapoAiProviderRequest, "model">,
  response: Response,
  details: ErrorDetails,
): MapoAiProviderError | undefined {
  const { message } = details;
  const names = namesOf(details);
  const isNoCredit =
    names.some((one) => NO_CREDIT_CODES.has(one)) || NO_CREDIT.test(message);
  if (isNoCredit) {
    return new MapoAiProviderError(
      "refused-request",
      `${server.name} answered ${response.status}: ${message} (the account's credit, not a rate: waiting does not help)`,
    );
  }
  if (response.status === 429) {
    return statusFailure(response, message, server.name);
  }
  const isContext =
    response.status === 413 ||
    names.some((one) => CONTEXT_CODES.has(one)) ||
    (response.status < 500 && CONTEXT_REFUSAL.test(message));
  if (isContext) {
    return new MapoAiProviderError(
      "too-long",
      `${server.name} refused the prompt for ${request.model}'s context${message ? `: ${message}` : ""}`,
    );
  }
  return undefined;
}

/** The code and the type an error names, as the providers write them. */
function namesOf(details: Pick<ErrorDetails, "code" | "type">): string[] {
  return [details.code, details.type].filter(
    (name): name is string => typeof name === "string" && name !== "",
  );
}

/**
 * The failure an error event of a stream says. OpenAI writes the error's
 * `code` and `message` on the event, Anthropic `type` and `message` in its
 * `error`: a rate limit is `rate-limit`, an account without credit
 * `refused-request`, a prompt too long `too-long`, anything else a server
 * that failed while it answered. What the server writes is masked and
 * bounded.
 */
export function streamFailure(
  server: ProviderServer,
  event: Record<string, unknown>,
  extra: { usage?: MapoAiUsage; model?: string } = {},
): MapoAiProviderError {
  const error = isRecord(event.error) ? event.error : event;
  const name = (field: unknown) =>
    typeof field === "string" && field !== "error"
      ? server.mask(field).slice(0, MAX_NAME)
      : undefined;
  const code = name(error.code);
  const type = name(error.type);
  const names = namesOf({ code, type });
  const message =
    typeof error.message === "string"
      ? server.mask(error.message.replace(/\s+/g, " ").trim()).slice(0, 300)
      : "";
  const isRateLimit = names.some((one) => /rate_limit/i.test(one));
  const isNoCredit =
    names.some((one) => NO_CREDIT_CODES.has(one)) || NO_CREDIT.test(message);
  const isContext = names.some((one) => CONTEXT_CODES.has(one));
  const failure = isRateLimit
    ? "rate-limit"
    : isNoCredit
      ? "refused-request"
      : isContext
        ? "too-long"
        : "unavailable";
  const kind = names[0];
  return new MapoAiProviderError(
    failure,
    `${server.name} failed while answering${kind ? ` (${kind})` : ""}${message ? `: ${message}` : ""}`,
    extra,
  );
}

/**
 * The usage of a call: the tokens of the whole prompt, of the answer with
 * its reasoning, and of the prompt read from or written to the provider's
 * cache, which cost less and more; a count of zero is left out.
 */
export function cloudUsage(counts: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}): MapoAiUsage {
  return {
    inputTokens: counts.input,
    outputTokens: counts.output,
    ...(counts.cacheRead > 0 ? { cacheReadTokens: counts.cacheRead } : {}),
    ...(counts.cacheWrite > 0 ? { cacheWriteTokens: counts.cacheWrite } : {}),
  };
}

/**
 * A provider's failure with what the call used before it, and the model
 * that answered when another than the one asked did: the audit keeps both.
 */
export function withUsage(
  error: MapoAiProviderError,
  usage: MapoAiUsage,
  model?: string,
): MapoAiProviderError {
  return new MapoAiProviderError(error.failure, error.message, {
    cause: error.cause,
    usage,
    ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
    ...(model ? { model } : {}),
  });
}

/** A name a server wrote, such as the model that answered, fit for a log line. */
export function serverName(
  server: ProviderServer,
  value: unknown,
): string | undefined {
  const isName = typeof value === "string" && value.trim() !== "";
  return isName ? server.mask(value).slice(0, MAX_NAME) : undefined;
}

/** A parameter a call may leave out, and how a refusal says a model does not take it. */
export interface OptionalParameter {
  /** Its name in the body, as OpenAI's `param` starts. */
  name: string;
  /**
   * A refusal that says a model does not take it: the parameter's name
   * with the API's words for an unknown or unsupported one, never the
   * name alone, so a refusal of anything else keeps it.
   */
  refused: RegExp;
  /** What the calls lose without it, for the log. */
  without: string;
}

/**
 * The optional parameter a refusal says a model does not take, among those
 * the call still sends: by OpenAI's code and parameter when it names them,
 * otherwise by the words of {@link OptionalParameter.refused}; `undefined`
 * for a refusal of something else.
 */
export function refusedParameter(
  details: ErrorDetails,
  optional: readonly OptionalParameter[],
  left: ReadonlySet<string>,
): OptionalParameter | undefined {
  const sent = optional.filter(({ name }) => !left.has(name));
  const head = details.param?.split(/[.[]/)[0];
  const isUnsupported =
    details.code !== undefined && UNSUPPORTED_CODES.has(details.code);
  const named = isUnsupported
    ? sent.find(({ name }) => name === head)
    : undefined;
  return named ?? sent.find(({ refused }) => refused.test(details.message));
}

/** A call to a cloud's API that may leave out the optional parameters a model refuses. */
export interface CloudCall {
  server: ProviderServer;
  request: MapoAiProviderRequest;
  /** Appended to the server's address: `/responses`. */
  path: string;
  optional: readonly OptionalParameter[];
  dropped: DroppedParameters;
  /** The body of the call, and its own headers, without the parameters in `left`. */
  build(left: ReadonlySet<string>): {
    body: unknown;
    headers?: Record<string, string>;
  };
  /** A refusal the provider reads first, such as a schema Anthropic cannot compile. */
  ownRefusal?(details: ErrorDetails): MapoAiProviderError | undefined;
}

/**
 * Calls a cloud's API, and returns its response once the server takes the
 * call. A 400 that says the model does not take one of the optional
 * parameters is asked again without it: once for each, so a call is made
 * at most once more than there are optional parameters. A parameter so
 * left out is remembered for the model, ten minutes, only once a call
 * without it is taken, and the log says so then. A refusal for the money,
 * the rate or the context is never read as one of a parameter.
 * @throws MapoAiProviderError for a refusal it does not ask again
 */
export async function callCloud(call: CloudCall): Promise<Response> {
  const { server, request } = call;
  const left = new Set(call.dropped.get(server.url, request.model));
  const leftNow: OptionalParameter[] = [];
  for (;;) {
    const { body, headers } = call.build(left);
    const response = await callServer(server, call.path, {
      body,
      signal: request.signal,
      ...(headers ? { headers } : {}),
    });
    if (response.ok) {
      for (const parameter of leftNow) {
        call.dropped.add(server.url, request.model, parameter.name);
        console.warn(
          `[mapo-ai] ${server.name}: ${request.model} does not take "${parameter.name}", so its calls leave it out for ten minutes: ${parameter.without}`,
        );
      }
      return response;
    }
    const details = await errorDetails(response, request.signal, server.mask);
    const own = call.ownRefusal?.(details);
    if (own) throw own;
    const known = knownRefusal(server, request, response, details);
    if (known) throw known;
    const parameter =
      response.status === 400
        ? refusedParameter(details, call.optional, left)
        : undefined;
    if (!parameter) throw statusFailure(response, details.message, server.name);
    left.add(parameter.name);
    leftNow.push(parameter);
  }
}

/**
 * The optional parameters each model refused, by server: a model may not
 * take an effort or a cache's options, as an older one, and its calls leave
 * them out for ten minutes instead of being refused again.
 */
export interface DroppedParameters {
  /** The parameters this model refused, while they are remembered. */
  get(server: string, model: string, now?: number): ReadonlySet<string>;
  add(server: string, model: string, name: string, now?: number): void;
}

/** A memory of the parameters models refused, in this process. */
export function createDroppedParameters(): DroppedParameters {
  const entries = new Map<string, { names: Set<string>; until: number }>();
  const keyOf = (server: string, model: string) =>
    JSON.stringify([server, model]);
  return {
    get(server, model, now = Date.now()) {
      const key = keyOf(server, model);
      const entry = entries.get(key);
      if (!entry) return new Set();
      if (entry.until > now) return new Set(entry.names);
      entries.delete(key);
      return new Set();
    },
    add(server, model, name, now = Date.now()) {
      const key = keyOf(server, model);
      const entry = entries.get(key);
      const names =
        entry && entry.until > now ? entry.names : new Set<string>();
      names.add(name);
      entries.delete(key);
      entries.set(key, { names, until: now + DROPPED_MS });
      // The oldest goes first: a Map keeps the order of insertion.
      for (const oldest of entries.keys()) {
        if (entries.size <= MAX_DROPPED) break;
        entries.delete(oldest);
      }
    },
  };
}

/**
 * An answer with each value of an `enum` written as its schema writes it.
 * Anthropic's structured outputs do not guarantee the case of an enum's
 * values: a string that matches one value of its `enum` but for case
 * becomes that value, and one that matches none, or several, stays as it
 * is, for the sanitizer to read. It follows the schema through objects,
 * arrays and an `anyOf` of objects, taking the first branch whose listed
 * values the object's match, so the work is bound by the schema's depth.
 * Returns a new value; `value` is outside data.
 */
export function withEnumCase(value: unknown, schema: JSONSchema): unknown {
  if (typeof value === "string") return enumValueOf(value, schema.enum);
  if (Array.isArray(value)) {
    const { items } = schema;
    return isRecord(items)
      ? value.map((one) => withEnumCase(one, items))
      : value;
  }
  if (!isRecord(value)) return value;
  const branch = schema.anyOf
    ? schema.anyOf.find((one) => fitsBranch(value, one))
    : schema;
  const properties = branch?.properties;
  if (!isRecord(properties)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => {
      const property = Object.hasOwn(properties, key)
        ? properties[key]
        : undefined;
      return [key, property ? withEnumCase(inner, property) : inner];
    }),
  );
}

/** The value of `list` that `value` writes but for case, when it is one; `value` otherwise. */
function enumValueOf(value: string, list: unknown[] | undefined): unknown {
  if (!list || list.includes(value)) return value;
  const lower = value.toLowerCase();
  const same = list.filter(
    (one) => typeof one === "string" && one.toLowerCase() === lower,
  );
  return same.length === 1 ? same[0] : value;
}

/** Whether every listed value of an object matches its branch's list, case aside. */
function fitsBranch(
  value: Record<string, unknown>,
  branch: JSONSchema,
): boolean {
  const properties = isRecord(branch.properties) ? branch.properties : {};
  return Object.entries(properties).every(([key, property]) => {
    const given = Object.hasOwn(value, key) ? value[key] : undefined;
    const list = property.enum;
    if (typeof given !== "string" || !Array.isArray(list)) return true;
    const lower = given.toLowerCase();
    return list.some(
      (one) => typeof one === "string" && one.toLowerCase() === lower,
    );
  });
}

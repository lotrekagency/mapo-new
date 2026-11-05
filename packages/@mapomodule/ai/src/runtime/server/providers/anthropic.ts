/**
 * The `anthropic` provider: Claude through Anthropic's Messages API, at
 * Anthropic's address or another the app sets (`baseURL`), such as a
 * proxy. It speaks the API's version 2026-10-21, which takes no sampling
 * parameter. Each call:
 * - holds the answer to its schema (`output_config.format`). Claude reads
 *   the schema, so the prompt does not repeat it;
 * - asks the reasoning of the provider's `effort`, `low` unless set: the
 *   current models think before they answer, and Opus 5.5 always does. The
 *   answer's cap counts the thinking too, and grows with the schema and
 *   the effort;
 * - marks the stable part of the prompt (Mapo's rules, the app's, the
 *   entity's) for Anthropic's prompt cache only with `promptCache`, for
 *   five minutes; never the source;
 * - asks Anthropic to retry a request its safety filters decline on the
 *   model it picks for that kind of request (`fallbacks: "default"`, a
 *   beta): a model the app does not list, at that model's prices. The
 *   answer names it, and the gateway's answer, its audit and the log say
 *   it;
 * - streams the answer, and reads why it stopped: an answer cut at its cap
 *   is `truncated`, a refusal of the model or of its filters a refusal;
 * - writes each listed value of the answer as its schema does, since
 *   Anthropic does not guarantee the case of an `enum`'s values.
 * A model that does not take an optional parameter, as an older one and an
 * effort, is asked again without it once the server says so, and its calls
 * leave it out for ten minutes.
 */

import { isRecord } from "../../shared/guards";
import {
  DEFAULT_EFFORT,
  callCloud,
  cloudAnswerTokens,
  cloudUsage,
  createDroppedParameters,
  missingKey,
  needsKey,
  serverName,
  streamFailure,
  withEnumCase,
  withUsage,
} from "./cloud";
import type { MapoAiEffort, OptionalParameter } from "./cloud";
import { providerServer, readEvents, serverJson } from "./http";
import type { ProviderServer, ServerFetch } from "./http";
import { answerOutput, tokenCount } from "./local";
import { MapoAiProviderError } from "./types";
import type {
  MapoAiModelInfo,
  MapoAiProvider,
  MapoAiProviderAnswer,
  MapoAiProviderRequest,
} from "./types";

/** What the `anthropic` provider is built from. */
export interface AnthropicSettings {
  /** The API's address, up to `/v1`, without the final `/`. */
  baseURL: string;
  /** The project's key, from the environment: sent as `x-api-key`. */
  apiKey?: string;
  /** How much the model reasons: `low` unless set. */
  effort?: MapoAiEffort;
  /** Marks the stable part of the prompt for Anthropic's cache. */
  promptCache?: boolean;
  /** How it calls the API: the global `fetch`, or a test's. */
  fetch?: ServerFetch;
}

/**
 * The models `anthropic` offers when `mapo.ai.providers.anthropic.models`
 * lists none, its default first: Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5.
 */
export const ANTHROPIC_MODELS: readonly string[] = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
];

/** The version of the API the provider speaks. */
const API_VERSION = "2026-10-21";
/** The beta of the fallbacks Anthropic picks by the kind of request declined. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** The environment's variable that holds the key. */
const KEY_VARIABLE = "NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY";
/**
 * The parameters a model may not take, and how Anthropic says a model does
 * not take one: "output_config.effort: Extra inputs are not permitted",
 * "This model does not support the effort parameter", or a beta it does
 * not know.
 */
const OPTIONAL: readonly OptionalParameter[] = [
  {
    name: "effort",
    refused:
      /output_config\.effort: Extra inputs are not permitted|does not support (?:the )?effort|\beffort\b[^.]* not supported/i,
    without: "the model reasons as much as it does by default",
  },
  {
    name: "fallbacks",
    refused:
      /(?:^|[\s,;])fallbacks: Extra inputs are not permitted|does not support (?:server-side )?fallbacks|\bfallbacks?\b[^.]* not supported|server-side-fallback-[\d-]+[^.]*anthropic-beta|anthropic-beta[^.]*server-side-fallback/i,
    without:
      "a request Anthropic's safety filters decline comes back as a refusal",
  },
];
/** Anthropic's refusal of a schema its structured outputs cannot compile. */
const TOO_COMPLEX = /too complex/i;

/** The counts of a message's usage, each read on its own. */
const COUNTS = [
  "input_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
] as const;

/** The parameters Anthropic's models refused, in this process. */
const dropped = createDroppedParameters();

/** What a call needs besides the request. */
interface CallSettings {
  effort: MapoAiEffort;
  promptCache: boolean;
  hasKey: boolean;
}

/** What the stream of an answer brought. */
interface Streamed {
  text: string;
  /** Why the model stopped: `end_turn`, `max_tokens`, `refusal`… */
  stop: string;
  /** The kind of request the safety filters declined, when they did. */
  category?: string;
  /** The model that answered, when the request fell back on another. */
  fellBackOn?: string;
  usage: ReturnType<typeof cloudUsage>;
}

/** The `anthropic` provider, calling the API of `settings`. */
export function createAnthropicProvider(
  settings: AnthropicSettings,
): MapoAiProvider {
  const server = providerServer("Anthropic", settings, {
    ...(settings.apiKey ? { "x-api-key": settings.apiKey } : {}),
    "anthropic-version": API_VERSION,
  });
  const call: CallSettings = {
    effort: settings.effort ?? DEFAULT_EFFORT,
    promptCache: settings.promptCache === true,
    hasKey: Boolean(settings.apiKey),
  };
  return {
    id: "anthropic",
    label: "Anthropic",
    capabilities: {
      structuredOutput: "strict",
      pdf: false,
      images: false,
      streaming: true,
      tools: false,
    },
    models: ANTHROPIC_MODELS,
    listModels: (signal) => listModels(server, call, signal),
    run: (request) => runAnthropic(server, request, call),
  };
}

/** The models the key may use (`/models`), with the context each reads. */
async function listModels(
  server: ProviderServer,
  call: CallSettings,
  signal: AbortSignal,
): Promise<MapoAiModelInfo[]> {
  requireKey(server, call);
  const answer = await serverJson(server, "/models?limit=1000", { signal });
  const list =
    isRecord(answer) && Array.isArray(answer.data) ? answer.data : [];
  const infos: MapoAiModelInfo[] = [];
  for (const entry of list) {
    const model = isRecord(entry) ? entry : {};
    if (typeof model.id !== "string" || model.id === "") continue;
    const contextTokens = tokenCount(model.max_input_tokens);
    const capabilities = isRecord(model.capabilities) ? model.capabilities : {};
    const images = isRecord(capabilities.image_input)
      ? capabilities.image_input.supported
      : undefined;
    infos.push({
      id: model.id,
      ...(contextTokens !== undefined ? { contextTokens } : {}),
      ...(typeof images === "boolean" ? { images } : {}),
    });
  }
  return infos;
}

async function runAnthropic(
  server: ProviderServer,
  request: MapoAiProviderRequest,
  call: CallSettings,
): Promise<MapoAiProviderAnswer> {
  requireKey(server, call);
  const cap = cloudAnswerTokens(
    request.task,
    JSON.stringify(request.schema).length,
    call.effort,
  );
  const response = await callCloud({
    server,
    request,
    path: "/messages",
    optional: OPTIONAL,
    dropped,
    build: (left) => ({
      body: requestBody(request, call, cap, left),
      // The beta goes with the parameter: a server that refuses one may
      // not know the other.
      ...(left.has("fallbacks")
        ? {}
        : { headers: { "anthropic-beta": FALLBACK_BETA } }),
    }),
    ownRefusal: ({ message }) =>
      TOO_COMPLEX.test(message)
        ? new MapoAiProviderError(
            "refused-request",
            `${server.name} could not compile the answer's schema for ${request.model}, too large or too nested for its structured outputs: ${message}`,
          )
        : undefined,
  });
  return answerOf(server, request, await readAnswer(server, response, request));
}

/** A call without the key its server needs fails before it is made. */
function requireKey(server: ProviderServer, call: CallSettings): void {
  if (!call.hasKey && needsKey(server.url, "anthropic.com")) {
    throw missingKey("anthropic", KEY_VARIABLE);
  }
}

/** The body of a call to `/messages`, without the parameters the model refused. */
function requestBody(
  request: MapoAiProviderRequest,
  call: CallSettings,
  cap: number,
  left: ReadonlySet<string>,
): Record<string, unknown> {
  // The mark ends the stable part: Anthropic caches what comes before it.
  const mark = call.promptCache ? { cache_control: { type: "ephemeral" } } : {};
  return {
    model: request.model,
    max_tokens: cap,
    stream: true,
    system: [{ type: "text", text: request.prompt.instructions, ...mark }],
    messages: [{ role: "user", content: request.prompt.input }],
    output_config: {
      format: { type: "json_schema", schema: request.schema },
      ...(left.has("effort") ? {} : { effort: call.effort }),
    },
    ...(left.has("fallbacks") ? {} : { fallbacks: "default" }),
  };
}

/**
 * The streamed answer: server-sent events, the message's start with the
 * model and the counts of the prompt, the text in pieces of its text
 * blocks (the thinking is not the answer), and the message's end with why
 * the model stopped and the counts of the answer. A request that fell back
 * on another model has a `fallback` block, or, served by that model again,
 * an attempt of type `fallback_message` among its counts.
 * @throws MapoAiProviderError `invalid-response` for no event;
 *   `unavailable` or `rate-limit` for an error in the stream; `unavailable`
 *   for a stream that ends before the model said why it stopped
 */
async function readAnswer(
  server: ProviderServer,
  response: Response,
  request: MapoAiProviderRequest,
): Promise<Streamed> {
  let text = "";
  let stop: unknown;
  let category: unknown;
  let started: unknown;
  let blockModel: unknown;
  let attemptModel: unknown;
  let fellBack = false;
  let events = 0;
  // Each count as the stream last said it: the counts grow along the
  // stream, and an event may say some of them only.
  const latest: Partial<Record<(typeof COUNTS)[number], number>> = {};
  const readCounts = (value: unknown) => {
    const usage = isRecord(value) ? value : {};
    const attempts = Array.isArray(usage.iterations)
      ? usage.iterations.filter(isRecord)
      : [];
    const served = attempts.filter((one) => one.type === "fallback_message");
    if (served.length) {
      fellBack = true;
      attemptModel = served[served.length - 1]?.model ?? attemptModel;
    }
    // Every attempt counts: the declined one too, at its model's prices.
    const parts = attempts.length ? attempts : [usage];
    for (const name of COUNTS) {
      const given = parts
        .map((one) => countOf(one[name]))
        .filter((count): count is number => count !== undefined);
      if (given.length) latest[name] = given.reduce((all, one) => all + one);
    }
  };
  const usage = () => {
    const read = latest.cache_read_input_tokens ?? 0;
    const written = latest.cache_creation_input_tokens ?? 0;
    return cloudUsage({
      input: (latest.input_tokens ?? 0) + read + written,
      output: latest.output_tokens ?? 0,
      cacheRead: read,
      cacheWrite: written,
    });
  };
  // The attempt that was billed names the model best; then the fallback
  // block; then the message, which may carry the asked model's full name.
  const servedBy = (): string | undefined => {
    const model = [attemptModel, blockModel, started].find(
      (one) => typeof one === "string" && one !== "",
    );
    const name = serverName(server, model);
    const isOther = fellBack && name !== undefined && name !== request.model;
    return isOther ? name : undefined;
  };
  try {
    await readEvents(
      response,
      (value) => {
        events += 1;
        const event = isRecord(value) ? value : {};
        if (event.type === "message_start") {
          const message = isRecord(event.message) ? event.message : {};
          started = message.model;
          readCounts(message.usage);
        } else if (event.type === "content_block_start") {
          const block = isRecord(event.content_block)
            ? event.content_block
            : {};
          if (block.type === "fallback") {
            fellBack = true;
            blockModel = isRecord(block.to) ? block.to.model : blockModel;
          }
        } else if (event.type === "content_block_delta") {
          const delta = isRecord(event.delta) ? event.delta : {};
          const isText = delta.type === "text_delta";
          if (isText && typeof delta.text === "string") text += delta.text;
        } else if (event.type === "message_delta") {
          const delta = isRecord(event.delta) ? event.delta : {};
          if (typeof delta.stop_reason === "string") stop = delta.stop_reason;
          if (isRecord(delta.stop_details)) {
            category = delta.stop_details.category;
          }
          readCounts(event.usage);
        } else if (event.type === "message_stop") {
          return true;
        } else if (event.type === "error") {
          throw streamFailure(server, event);
        }
      },
      { signal: request.signal, name: server.name, mask: server.mask },
    );
  } catch (error) {
    // What the call used before it failed is paid: the audit keeps it.
    const isUncounted =
      error instanceof MapoAiProviderError &&
      error.usage === undefined &&
      events > 0;
    throw isUncounted ? withUsage(error, usage(), servedBy()) : error;
  }
  if (!events) {
    throw new MapoAiProviderError(
      "invalid-response",
      `${server.name} sent no event of an answer`,
    );
  }
  const fellBackOn = servedBy();
  if (typeof stop !== "string") {
    throw new MapoAiProviderError(
      "unavailable",
      `${server.name} stopped before the end of its answer`,
      { usage: usage(), ...(fellBackOn ? { model: fellBackOn } : {}) },
    );
  }
  const kind = serverName(server, category);
  return {
    text,
    stop,
    ...(kind ? { category: kind } : {}),
    ...(fellBackOn ? { fellBackOn } : {}),
    usage: usage(),
  };
}

/**
 * The answer the model stopped with: a cut one fails the call, a refusal
 * is the model's words when it wrote some, or what its filters declined.
 */
function answerOf(
  server: ProviderServer,
  request: MapoAiProviderRequest,
  streamed: Streamed,
): MapoAiProviderAnswer {
  const { usage, fellBackOn } = streamed;
  const served = fellBackOn ? { model: fellBackOn } : {};
  if (fellBackOn) {
    console.warn(
      `[mapo-ai] ${server.name}: ${request.model} declined the request, so ${fellBackOn} answered it, at its own prices (fallbacks)`,
    );
  }
  if (streamed.stop === "max_tokens") {
    throw new MapoAiProviderError(
      "truncated",
      `${request.model} on ${server.name} reached the most the answer may write, its thinking included: the answer is cut`,
      { usage, ...served },
    );
  }
  if (streamed.stop === "model_context_window_exceeded") {
    throw new MapoAiProviderError(
      "too-long",
      `${request.model} on ${server.name} ran out of context before the end of its answer`,
      { usage, ...served },
    );
  }
  if (streamed.stop === "refusal") {
    return {
      status: "refused",
      refusal: refusalText(streamed),
      usage,
      ...served,
    };
  }
  // Claude may write a listed value with another case than its schema's.
  return {
    status: "answered",
    output: withEnumCase(answerOutput(streamed.text), request.schema),
    usage,
    ...served,
  };
}

/** A count of tokens the API wrote: a whole number from 0; `undefined` otherwise. */
function countOf(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined;
}

/**
 * What a refusal says: the model's own words, when it wrote some that are
 * not the start of an answer; otherwise that the filters declined, and the
 * kind of request.
 */
function refusalText(streamed: Streamed): string {
  const said = streamed.text.trim();
  const isWords = said !== "" && !said.startsWith("{");
  if (isWords) return said.slice(0, 1000);
  const kind = streamed.category ? ` (${streamed.category})` : "";
  return `Anthropic's safety filters declined the request${kind}`;
}

/**
 * The `openai` provider: OpenAI's models through its Responses API, at
 * OpenAI's address or another the app sets (`baseURL`), such as OpenAI's
 * European one. Each call:
 * - holds the answer to its schema (`text.format`, `json_schema`, strict).
 *   OpenAI shows the schema to the model, so the prompt does not repeat it;
 * - keeps nothing at OpenAI (`store: false`);
 * - asks the reasoning of the provider's `effort`, `low` unless set, and
 *   caps the answer, reasoning included, by the schema's size and the
 *   effort;
 * - writes to OpenAI's prompt cache only with `promptCache`: one breakpoint
 *   after the stable part of the prompt (Mapo's rules, the app's, the
 *   entity's), never on the source. Without it, no breakpoint at all: left
 *   to itself, OpenAI writes the whole prompt to its cache, the source
 *   included, and bills the writing;
 * - streams the answer, and reads why it stopped: an answer cut at its cap
 *   is `truncated`, OpenAI's content filter a refusal.
 * A model that does not take an optional parameter, as an older one and
 * the cache's options, is asked again without it once the server says so
 * (`callCloud()`), and its calls leave it out for ten minutes. Without the
 * cache's options OpenAI caches by its own rules, so the log says that.
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
} from "./cloud";
import type { MapoAiEffort, OptionalParameter } from "./cloud";
import { readEvents, providerServer, serverJson } from "./http";
import type { ProviderServer, ServerFetch } from "./http";
import { answerOutput, tokenCount } from "./local";
import { MapoAiProviderError } from "./types";
import type {
  MapoAiModelInfo,
  MapoAiProvider,
  MapoAiProviderAnswer,
  MapoAiProviderRequest,
} from "./types";

/** What the `openai` provider is built from. */
export interface OpenAiSettings {
  /** The API's address, up to `/v1`, without the final `/`. */
  baseURL: string;
  /** The project's key, from the environment: sent as a bearer token. */
  apiKey?: string;
  /** How much the model reasons: `low` unless set. */
  effort?: MapoAiEffort;
  /** Writes the stable part of the prompt to OpenAI's cache. */
  promptCache?: boolean;
  /** How it calls the API: the global `fetch`, or a test's. */
  fetch?: ServerFetch;
}

/**
 * The models `openai` offers when `mapo.ai.providers.openai.models` lists
 * none, its default first: GPT-6.1 Sol, and GPT-6 Luna, the most efficient.
 */
export const OPENAI_MODELS: readonly string[] = ["gpt-6.1-sol", "gpt-6-luna"];

/** The environment's variable that holds the key. */
const KEY_VARIABLE = "NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY";
/**
 * The parameters a model may not take, and how OpenAI says a model does
 * not take one: "Unsupported parameter: 'reasoning.effort' is not
 * supported with this model", "Unknown parameter: 'prompt_cache_options'".
 * A refusal of the breakpoint alone is no refusal of the options: the call
 * fails instead of going on without them.
 */
const OPTIONAL: readonly OptionalParameter[] = [
  {
    name: "reasoning",
    refused:
      /(?:unsupported|unknown|unrecognized) (?:parameter|value|request argument)[^.]*\breasoning\b/i,
    without: "the model reasons as much as it does by default",
  },
  {
    name: "prompt_cache_options",
    refused:
      /(?:unsupported|unknown|unrecognized) (?:parameter|value|request argument)[^.]*\bprompt_cache_options\b/i,
    without:
      "OpenAI caches its prompts by its own rules, which may write the whole prompt to its cache and bill the writing, whatever promptCache says",
  },
];
/** The longest refusal kept, of the model's own words. */
const MAX_REFUSAL = 1000;
/** The events that end a response, each with the response as it ended. */
const ENDS = new Set([
  "response.completed",
  "response.incomplete",
  "response.failed",
]);

/** The parameters OpenAI's models refused, in this process. */
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
  refusal: string;
  /** The response as it ended: completed, incomplete or failed. */
  ended: Record<string, unknown>;
}

/** The `openai` provider, calling the API of `settings`. */
export function createOpenAiProvider(settings: OpenAiSettings): MapoAiProvider {
  const server = providerServer("OpenAI", settings);
  const call: CallSettings = {
    effort: settings.effort ?? DEFAULT_EFFORT,
    promptCache: settings.promptCache === true,
    hasKey: Boolean(settings.apiKey),
  };
  return {
    id: "openai",
    label: "OpenAI",
    capabilities: {
      structuredOutput: "strict",
      pdf: false,
      images: false,
      streaming: true,
      tools: false,
    },
    models: OPENAI_MODELS,
    listModels: (signal) => listModels(server, call, signal),
    run: (request) => runOpenAi(server, request, call),
  };
}

/** The models the key may use (`/models`): their ids, which is all OpenAI says. */
async function listModels(
  server: ProviderServer,
  call: CallSettings,
  signal: AbortSignal,
): Promise<MapoAiModelInfo[]> {
  requireKey(server, call);
  const answer = await serverJson(server, "/models", { signal });
  const list =
    isRecord(answer) && Array.isArray(answer.data) ? answer.data : [];
  return list.flatMap((entry) => {
    const id = isRecord(entry) ? entry.id : undefined;
    return typeof id === "string" && id !== "" ? [{ id }] : [];
  });
}

async function runOpenAi(
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
    path: "/responses",
    optional: OPTIONAL,
    dropped,
    build: (left) => ({ body: requestBody(request, call, cap, left) }),
  });
  return answerOf(server, await readAnswer(server, response, request));
}

/** A call without the key its server needs fails before it is made. */
function requireKey(server: ProviderServer, call: CallSettings): void {
  if (!call.hasKey && needsKey(server.url, "openai.com")) {
    throw missingKey("openai", KEY_VARIABLE);
  }
}

/** The body of a call to `/responses`, without the parameters the model refused. */
function requestBody(
  request: MapoAiProviderRequest,
  call: CallSettings,
  cap: number,
  left: ReadonlySet<string>,
): Record<string, unknown> {
  const takesCache = !left.has("prompt_cache_options");
  // The breakpoint marks the end of the stable part: OpenAI caches what
  // comes before it, and only that. Top-level `instructions` cannot hold
  // one, so the stable part is a developer message.
  const breakpoint =
    call.promptCache && takesCache
      ? { prompt_cache_breakpoint: { mode: "explicit" } }
      : {};
  return {
    model: request.model,
    stream: true,
    store: false,
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: request.prompt.instructions,
            ...breakpoint,
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: request.prompt.input }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "mapo_ai_answer",
        strict: true,
        schema: request.schema,
      },
    },
    max_output_tokens: cap,
    ...(left.has("reasoning") ? {} : { reasoning: { effort: call.effort } }),
    // Explicit, with or without a breakpoint: without one, nothing is
    // written to the cache.
    ...(takesCache ? { prompt_cache_options: { mode: "explicit" } } : {}),
  };
}

/**
 * The streamed answer: server-sent events, the text in pieces
 * (`response.output_text.delta`), a refusal in pieces
 * (`response.refusal.delta`), and an event that ends the response with
 * the response itself, its status and its usage.
 * @throws MapoAiProviderError `invalid-response` for no event;
 *   `unavailable` or `rate-limit` for an error in the stream; `unavailable`
 *   for a stream that ends before the response does
 */
async function readAnswer(
  server: ProviderServer,
  response: Response,
  request: MapoAiProviderRequest,
): Promise<Streamed> {
  let text = "";
  let refusal = "";
  let ended: Record<string, unknown> | undefined;
  let events = 0;
  await readEvents(
    response,
    (value) => {
      events += 1;
      const event = isRecord(value) ? value : {};
      const isPiece = typeof event.delta === "string";
      if (event.type === "response.output_text.delta" && isPiece) {
        text += String(event.delta);
      } else if (event.type === "response.refusal.delta" && isPiece) {
        refusal += String(event.delta);
      } else if (event.type === "error") {
        throw streamFailure(server, event);
      } else if (typeof event.type === "string" && ENDS.has(event.type)) {
        ended = isRecord(event.response) ? event.response : {};
        return true;
      }
    },
    { signal: request.signal, name: server.name, mask: server.mask },
  );
  if (!events) {
    throw new MapoAiProviderError(
      "invalid-response",
      `${server.name} sent no event of an answer`,
    );
  }
  if (!ended) {
    throw new MapoAiProviderError(
      "unavailable",
      `${server.name} stopped before the end of its answer`,
    );
  }
  return { text, refusal, ended };
}

/**
 * The answer a response ended with: a failed one fails the call, an
 * incomplete one is a cut answer or a refusal of the content filter.
 */
function answerOf(
  server: ProviderServer,
  streamed: Streamed,
): MapoAiProviderAnswer {
  const { ended } = streamed;
  const usage = usageOf(ended.usage);
  if (ended.status === "failed") {
    const error = isRecord(ended.error) ? ended.error : {};
    throw streamFailure(server, error, { usage });
  }
  if (ended.status === "incomplete") {
    const details = isRecord(ended.incomplete_details)
      ? ended.incomplete_details
      : {};
    if (details.reason === "content_filter") {
      return {
        status: "refused",
        refusal: "OpenAI's content filter stopped the answer",
        usage,
      };
    }
    if (details.reason === "max_output_tokens") {
      throw new MapoAiProviderError(
        "truncated",
        `${server.name} reached the most the answer may write, its reasoning included: the answer is cut`,
        { usage },
      );
    }
    const reason = serverName(server, details.reason) ?? "no reason given";
    throw new MapoAiProviderError(
      "unavailable",
      `${server.name} left the answer incomplete (${reason})`,
      { usage },
    );
  }
  if (streamed.refusal !== "") {
    return {
      status: "refused",
      refusal: streamed.refusal.slice(0, MAX_REFUSAL),
      usage,
    };
  }
  return { status: "answered", output: answerOutput(streamed.text), usage };
}

/**
 * The counts of a response: `input_tokens` is the whole prompt, the cached
 * part included; `output_tokens` the answer with its reasoning.
 */
function usageOf(value: unknown): ReturnType<typeof cloudUsage> {
  const usage = isRecord(value) ? value : {};
  const details = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : {};
  return cloudUsage({
    input: tokenCount(usage.input_tokens) ?? 0,
    output: tokenCount(usage.output_tokens) ?? 0,
    cacheRead: tokenCount(details.cached_tokens) ?? 0,
    cacheWrite: tokenCount(details.cache_write_tokens) ?? 0,
  });
}

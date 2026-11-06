/**
 * The `openai-compatible` provider: a model served by a server that speaks
 * OpenAI's Chat Completions API, such as LM Studio, vLLM or the server of
 * llama.cpp, on the app's server or in its network. `baseURL` is the
 * address the server answers `/chat/completions` and `/models` under,
 * usually ending in `/v1`.
 *
 * Each call puts the answer's schema in the prompt and in
 * `response_format` (`json_schema`, strict), streams the answer, and caps
 * it (`max_tokens`) by the schema's size. Such a server sets the context of
 * its models itself, and some cut a prompt that does not fit instead of
 * refusing it, so the provider checks what it can, failing with `too-long`:
 * - a server's own refusal for the context, as vLLM and llama.cpp do. vLLM
 *   refuses a prompt and a cap that do not fit together, and says how many
 *   tokens the prompt has: the provider asks once more with the cap that
 *   fits, when an answer still has room;
 * - when the context is known, from the server's list of models (vLLM's
 *   `max_model_len`) or from the app (`contextTokens`): before the call, a
 *   prompt that cannot fit, and a cap that leaves room for the prompt;
 *   after it, a prompt the server counted up to the context, with no room
 *   left for an answer, since a cut prompt fills it;
 * - after the call, a prompt counted well below its size, which was cut.
 * These come before a cut answer: a prompt cut to fill the context, after
 * which the answer ran out of room, is a prompt too long, not an answer.
 * Without a known context, a server that cuts a prompt a little too long,
 * as Ollama's own `/v1` does, can let it through: the rules at its top may
 * be gone. That is why the app says the context of such a server.
 * It does not turn a model's reasoning off: no parameter does so on every
 * server, and one a server does not know can fail the call.
 */

import { isRecord } from "../../shared/guards";
import {
  CONTEXT_REFUSAL,
  callServer,
  errorMessage,
  providerServer,
  readEvents,
  serverJson,
  statusFailure,
} from "./http";
import type { ProviderServer, ServerFetch } from "./http";
import {
  MIN_ANSWER_ROOM,
  answerOutput,
  answerTokens,
  createModelInfoCache,
  instructionsWithSchema,
  tokenCount,
  tokensAtLeast,
} from "./local";
import { MapoAiProviderError } from "./types";
import type {
  MapoAiModelInfo,
  MapoAiProvider,
  MapoAiProviderAnswer,
  MapoAiProviderRequest,
} from "./types";

/** What the `openai-compatible` provider is built from. */
export interface OpenAiCompatibleSettings {
  /** The server's address, up to `/v1` or what stands for it, without the final `/`. */
  baseURL: string;
  /** A key the server asks, or a proxy before it: sent as a bearer token. */
  apiKey?: string;
  /** The tokens the server's models read, when its list does not say it. */
  contextTokens?: number;
  /** How it calls the server: the global `fetch`, or a test's. */
  fetch?: ServerFetch;
}

/** What the servers say about their models, in this process. */
const models = createModelInfoCache();

/**
 * The tokens of the prompt in vLLM's refusal: "(5000 in the messages, 4000
 * in the completion)", or "your request has 5000 input tokens".
 */
const PROMPT_TOKENS = [
  /\((\d+) in the messages/i,
  /your request has (\d+) input tokens/i,
];
/** The model's context in vLLM's refusal: "maximum context length is 8192 tokens". */
const CONTEXT_TOKENS = /maximum context length is (\d+)/i;

/** The servers that sent an answer without its counts, said once each in the log. */
const withoutCounts = new Set<string>();

/** What the stream of an answer brought, before it is read against the context. */
interface Streamed {
  text: string;
  refusal: string;
  finish: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** A refusal of the server for the context, with what it says of the prompt. */
interface ContextRefusal {
  message: string;
  /** The tokens of the prompt, as the server counted them. */
  prompt?: number;
  /** The tokens the model reads, as the server says. */
  context?: number;
}

/** The `openai-compatible` provider, calling the server of `settings`. */
export function createOpenAiCompatibleProvider(
  settings: OpenAiCompatibleSettings,
): MapoAiProvider {
  const server = providerServer("The OpenAI-compatible server", settings);
  const declared = settings.contextTokens;
  return {
    id: "openai-compatible",
    label: "OpenAI-compatible server",
    key: "optional",
    capabilities: {
      // The servers differ in how they hold the answer to its schema: the
      // sanitizer is the check that holds on every one.
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: true,
      tools: false,
    },
    listModels: (signal) => listModels(server, signal),
    run: (request) => runCompatible(server, request, declared),
  };
}

/**
 * The models the server has (`/models`), with the context of each when it
 * says it, as vLLM does (`max_model_len`).
 */
async function listModels(
  server: ProviderServer,
  signal: AbortSignal,
): Promise<MapoAiModelInfo[]> {
  const answer = await serverJson(server, "/models", { signal });
  const list =
    isRecord(answer) && Array.isArray(answer.data) ? answer.data : [];
  const infos: MapoAiModelInfo[] = [];
  for (const entry of list) {
    const model = isRecord(entry) ? entry : {};
    if (typeof model.id !== "string" || model.id === "") continue;
    const contextTokens = tokenCount(model.max_model_len);
    infos.push({
      id: model.id,
      ...(contextTokens !== undefined ? { contextTokens } : {}),
    });
  }
  return infos;
}

async function runCompatible(
  server: ProviderServer,
  request: MapoAiProviderRequest,
  declared: number | undefined,
): Promise<MapoAiProviderAnswer> {
  const system = instructionsWithSchema(request.prompt, request.schema);
  const fewest = tokensAtLeast(system.length + request.prompt.input.length);
  const listed = await knownContext(server, request.model, request.signal);
  const most = listed ?? declared;
  const cannotFit = most !== undefined && fewest + MIN_ANSWER_ROOM > most;
  if (cannotFit) {
    throw new MapoAiProviderError(
      "too-long",
      `The prompt takes at least ${fewest} tokens: with an answer, it does not fit the ${most} tokens ${request.model} reads on ${server.name}`,
    );
  }
  const answer = answerTokens(
    request.task,
    JSON.stringify(request.schema).length,
  );
  // With the context known, the cap leaves room for the prompt, counted on
  // the low side: vLLM refuses a prompt and a cap that do not fit together.
  const cap = most === undefined ? answer : Math.min(answer, most - fewest);
  let call = await chat(server, request, system, cap);
  if ("refused" in call) {
    const { refused } = call;
    const context = refused.context ?? most;
    const room =
      context !== undefined && refused.prompt !== undefined
        ? context - refused.prompt
        : undefined;
    const canAskAgain =
      room !== undefined && room >= MIN_ANSWER_ROOM && room < cap;
    if (!canAskAgain) throw refusedForContext(server, request, refused);
    call = await chat(server, request, system, Math.min(answer, room));
    if ("refused" in call)
      throw refusedForContext(server, request, call.refused);
  }
  const { streamed } = call;
  const read = streamed.usage.inputTokens;
  const isBelowItsSize = read > 0 && read < fewest;
  if (isBelowItsSize) {
    throw new MapoAiProviderError(
      "too-long",
      `${server.name} read ${read} tokens of a prompt of at least ${fewest}: it cut the prompt to fit ${request.model}'s context`,
    );
  }
  const fillsTheContext = most !== undefined && read + MIN_ANSWER_ROOM > most;
  if (fillsTheContext) {
    throw new MapoAiProviderError(
      "too-long",
      `${server.name} read ${read} tokens of the ${most} ${request.model} reads: the prompt was cut to fit, or leaves no room for an answer`,
    );
  }
  const hasNoCounts = most !== undefined && read === 0;
  if (hasNoCounts && !withoutCounts.has(server.url)) {
    withoutCounts.add(server.url);
    console.warn(
      `[mapo-ai] ${server.name} answered without the counts of the prompt (usage): the provider cannot tell whether it cut a prompt to fit the context.`,
    );
  }
  if (streamed.finish === "length") {
    throw new MapoAiProviderError(
      "truncated",
      `${request.model} on ${server.name} reached the most it may write: the answer is cut`,
    );
  }
  const isFiltered = streamed.finish === "content_filter";
  if (streamed.refusal !== "" || isFiltered) {
    return {
      status: "refused",
      refusal:
        streamed.refusal ||
        `${server.name}'s content filter stopped the answer`,
      usage: streamed.usage,
    };
  }
  return {
    status: "answered",
    output: answerOutput(streamed.text),
    usage: streamed.usage,
  };
}

/**
 * One call to `/chat/completions` with a cap on the answer: the streamed
 * answer, or the server's refusal for the context, with its counts.
 */
async function chat(
  server: ProviderServer,
  request: MapoAiProviderRequest,
  system: string,
  maxTokens: number,
): Promise<{ streamed: Streamed } | { refused: ContextRefusal }> {
  const body = {
    model: request.model,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0,
    max_tokens: maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mapo_ai_answer",
        strict: true,
        schema: request.schema,
      },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: request.prompt.input },
    ],
  };
  const { signal } = request;
  const response = await callServer(server, "/chat/completions", {
    body,
    signal,
  });
  if (!response.ok) {
    const message = await errorMessage(response, signal, server.mask);
    const isContext =
      response.status === 413 ||
      (response.status < 500 && CONTEXT_REFUSAL.test(message));
    if (isContext) return { refused: refusalOf(message) };
    throw statusFailure(response, message, server.name);
  }
  return { streamed: await readAnswer(server, response, request) };
}

/** What a refusal for the context says of the prompt and of the model. */
function refusalOf(message: string): ContextRefusal {
  const prompt = PROMPT_TOKENS.map((pattern) => pattern.exec(message))
    .map((match) => tokenCount(match ? Number(match[1]) : undefined))
    .find((count) => count !== undefined);
  const contextMatch = CONTEXT_TOKENS.exec(message);
  const context = tokenCount(
    contextMatch ? Number(contextMatch[1]) : undefined,
  );
  return {
    message,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(context !== undefined ? { context } : {}),
  };
}

function refusedForContext(
  server: ProviderServer,
  request: MapoAiProviderRequest,
  refused: ContextRefusal,
): MapoAiProviderError {
  return new MapoAiProviderError(
    "too-long",
    `${server.name} refused the prompt for ${request.model}'s context${refused.message ? `: ${refused.message}` : ""}`,
  );
}

/**
 * The streamed answer: server-sent events, each with a piece of the text
 * (`choices[0].delta.content`), the last ones with why the model stopped
 * and the counts (`usage`).
 * @throws MapoAiProviderError `invalid-response` for no event; `unavailable`
 *   for an error in the stream, or a stream that ends before the model said
 *   why it stopped, as when a server or a proxy drops the connection
 */
async function readAnswer(
  server: ProviderServer,
  response: Response,
  request: MapoAiProviderRequest,
): Promise<Streamed> {
  let text = "";
  let refusal = "";
  let finish: unknown;
  let usage: Record<string, unknown> = {};
  let events = 0;
  await readEvents(
    response,
    (value) => {
      events += 1;
      const chunk = isRecord(value) ? value : {};
      if (chunk.error !== undefined) {
        const error = isRecord(chunk.error) ? chunk.error.message : chunk.error;
        throw new MapoAiProviderError(
          "unavailable",
          `${server.name} failed while answering: ${server.mask(String(error)).slice(0, 300)}`,
        );
      }
      if (isRecord(chunk.usage)) usage = chunk.usage;
      const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
      const choice = isRecord(choices[0]) ? choices[0] : {};
      const delta = isRecord(choice.delta) ? choice.delta : {};
      // The reasoning, which some servers send in a field of its own, is not the answer.
      if (typeof delta.content === "string") text += delta.content;
      if (typeof delta.refusal === "string") refusal += delta.refusal;
      if (typeof choice.finish_reason === "string")
        finish = choice.finish_reason;
    },
    { signal: request.signal, name: server.name, mask: server.mask },
  );
  if (!events) {
    throw new MapoAiProviderError(
      "invalid-response",
      `${server.name} sent no event of an answer`,
    );
  }
  if (typeof finish !== "string") {
    throw new MapoAiProviderError(
      "unavailable",
      `${server.name} stopped before the end of its answer`,
    );
  }
  return {
    text,
    refusal,
    finish,
    usage: {
      inputTokens: tokenCount(usage.prompt_tokens) ?? 0,
      outputTokens: tokenCount(usage.completion_tokens) ?? 0,
    },
  };
}

/**
 * The context of a model, as the server's list says it, kept ten minutes;
 * `undefined` when the list does not say it, or cannot be read.
 */
async function knownContext(
  server: ProviderServer,
  model: string,
  signal: AbortSignal,
): Promise<number | undefined> {
  const kept = models.get(server.url, model);
  if (kept) return kept.contextTokens;
  let listed: MapoAiModelInfo[];
  try {
    listed = await listModels(server, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    // A server without a list, or a list that cannot be read: the call
    // still goes, and the checks after it still hold.
    models.set(server.url, { id: model });
    return undefined;
  }
  for (const info of listed) models.set(server.url, info);
  const own = listed.find((info) => info.id === model);
  if (!own) models.set(server.url, { id: model });
  return own?.contextTokens;
}

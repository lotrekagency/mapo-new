/**
 * The `ollama` provider: a model served by Ollama, on the app's server or
 * in its network, through Ollama's native API. It is the API that takes a
 * context for each call (`num_ctx`), says each model's limit and what it can
 * do (`/api/show`), and turns the model's reasoning off (`think: false`).
 *
 * By default Ollama cuts a prompt longer than the context, and on a full
 * context drops the start of the prompt to write on: either way the rules
 * at the top are lost, without an error, and the model answers anyway.
 * Every call sends `truncate: false`, so Ollama refuses a prompt that does
 * not fit and says how many tokens it has, and `shift: false`, so a full
 * context ends the answer instead. Both are fields of Ollama's chat request
 * that its API reference does not list: the provider calls only an Ollama
 * of the version it was verified with, or later, and still checks after
 * the call that the prompt was not cut. A call:
 * 1. reads Ollama's version and the model's limit, kept ten minutes;
 * 2. puts the answer's schema in the prompt: Ollama holds the answer to it
 *    (`format`) but does not show it to the model;
 * 3. asks a context for the prompt, estimated on the high side, and the
 *    answer, whose cap grows with the schema. When Ollama counts more tokens
 *    than the estimate, it asks once more with room for what Ollama
 *    counted, and fails with `too-long` when the model's limit has none;
 * 4. streams the answer, so the time the model takes to write it does not
 *    count against Node's `fetch`, which waits five minutes for a server's
 *    first bytes: Ollama sends them with the first words, after loading the
 *    model and reading the whole prompt;
 * 5. fails with `too-long` when Ollama counted the prompt well below its
 *    size, and with `truncated` when the answer reached its cap or the
 *    context.
 */

import { isRecord } from "../../shared/guards";
import {
  callServer,
  errorMessage,
  providerServer,
  readJsonLines,
  serverJson,
  statusFailure,
} from "./http";
import type { ProviderServer, ServerFetch } from "./http";
import {
  MIN_ANSWER_ROOM,
  answerOutput,
  answerTokens,
  contextTokens,
  createModelInfoCache,
  instructionsWithSchema,
  tokenCount,
  tokensAtLeast,
  tokensAtMost,
} from "./local";
import { MapoAiProviderError } from "./types";
import type {
  MapoAiModelInfo,
  MapoAiProvider,
  MapoAiProviderAnswer,
  MapoAiProviderRequest,
} from "./types";

/** What the `ollama` provider is built from. */
export interface OllamaSettings {
  /** Ollama's address, without the final `/`. */
  baseURL: string;
  /** A key Ollama asks, or a proxy before it: sent as a bearer token. */
  apiKey?: string;
  /** How it calls Ollama: the global `fetch`, or a test's. */
  fetch?: ServerFetch;
}

/** What a call asks: the context, and the most the answer may write. */
interface Budget {
  context: number;
  answer: number;
}

/** What Ollama says about its models, in this process. */
const models = createModelInfoCache();

/**
 * The first version of Ollama the provider was verified with: one that
 * honours `truncate: false` and `shift: false` in a chat request. An older
 * Ollama may ignore them, and cut a prompt in silence.
 */
const MIN_OLLAMA_VERSION = "0.40.13";
/** How long an Ollama found recent enough is not asked again, in milliseconds. */
const VERSION_MS = 10 * 60 * 1000;
/** The servers found recent enough, until when. */
const recentEnough = new Map<string, number>();

/** Ollama's refusal of a prompt longer than the context, with its count of tokens. */
const TOO_LONG =
  /request \((\d+) tokens?\) exceeds the available context size/i;

/** The `ollama` provider, calling the Ollama of `settings`. */
export function createOllamaProvider(settings: OllamaSettings): MapoAiProvider {
  const server = providerServer("Ollama", settings);
  return {
    id: "ollama",
    label: "Ollama",
    capabilities: {
      structuredOutput: "strict",
      pdf: false,
      images: false,
      streaming: true,
      tools: false,
    },
    listModels: (signal) => listModels(server, signal),
    run: (request) => runOllama(server, request),
  };
}

/**
 * The models Ollama has (`/api/tags`). A model named with the `latest` tag
 * is listed without it too, as Ollama reads a name without a tag.
 */
async function listModels(
  server: ProviderServer,
  signal: AbortSignal,
): Promise<MapoAiModelInfo[]> {
  const answer = await serverJson(server, "/api/tags", { signal });
  const list =
    isRecord(answer) && Array.isArray(answer.models) ? answer.models : [];
  const ids = new Set<string>();
  for (const entry of list) {
    const name = isRecord(entry) ? entry.name : undefined;
    if (typeof name !== "string" || name === "") continue;
    ids.add(name);
    if (name.endsWith(":latest")) ids.add(name.slice(0, -":latest".length));
  }
  return [...ids].map((id) => ({ id }));
}

async function runOllama(
  server: ProviderServer,
  request: MapoAiProviderRequest,
): Promise<MapoAiProviderAnswer> {
  await requireVersion(server, request.signal);
  const info = await modelInfo(server, request.model, request.signal);
  const most = info.contextTokens;
  const system = instructionsWithSchema(request.prompt, request.schema);
  const chars = system.length + request.prompt.input.length;
  const answer = answerTokens(
    request.task,
    JSON.stringify(request.schema).length,
  );
  const first: Budget = {
    context: contextTokens(tokensAtMost(chars), answer, most),
    answer,
  };
  const fewest = tokensAtLeast(chars);
  const firstCall = await chat(server, request, system, first);
  if ("answer" in firstCall) return whole(firstCall.answer, fewest, server);

  // Ollama counted more tokens than the estimate: once more, with room for
  // what it counted and an answer.
  const counted = firstCall.counted;
  const room = (most ?? Number.POSITIVE_INFINITY) - counted;
  if (room < MIN_ANSWER_ROOM)
    throw tooLong(server, request.model, counted, most);
  const cap = Math.min(answer, room);
  const second: Budget = {
    context: contextTokens(counted, cap, most),
    answer: cap,
  };
  if (second.context <= first.context) {
    throw tooLong(server, request.model, counted, most);
  }
  const secondCall = await chat(server, request, system, second);
  if ("answer" in secondCall) return whole(secondCall.answer, fewest, server);
  throw tooLong(server, request.model, secondCall.counted, most);
}

/**
 * The answer, when Ollama read the whole prompt. Ollama counts the tokens of
 * the prompt it read, those it kept in its cache included: a count well
 * below the prompt's size means it cut the prompt, as an Ollama that
 * ignores `truncate: false` would.
 * @throws MapoAiProviderError `too-long` for a prompt Ollama cut
 */
function whole(
  answer: MapoAiProviderAnswer,
  fewest: number,
  server: ProviderServer,
): MapoAiProviderAnswer {
  const read = answer.usage.inputTokens;
  const wasCut = read > 0 && read < fewest;
  if (!wasCut) return answer;
  throw new MapoAiProviderError(
    "too-long",
    `${server.name} read ${read} tokens of a prompt of at least ${fewest}: it cut the prompt`,
  );
}

/**
 * Calls only an Ollama of the version the provider was verified with, or
 * later; one found so is not asked again for ten minutes.
 * @throws MapoAiProviderError `refused-request` for an older Ollama, or a
 *   version that cannot be read
 */
async function requireVersion(
  server: ProviderServer,
  signal: AbortSignal,
): Promise<void> {
  const until = recentEnough.get(server.url);
  if (until !== undefined && until > Date.now()) return;
  const answer = await serverJson(server, "/api/version", { signal });
  const version = isRecord(answer) ? answer.version : undefined;
  const isRecentEnough =
    typeof version === "string" && isAtLeast(version, MIN_OLLAMA_VERSION);
  if (!isRecentEnough) {
    const found =
      typeof version === "string" ? version.slice(0, 40) : "no version";
    throw new MapoAiProviderError(
      "refused-request",
      `${server.name} is Ollama ${found}: Mapo's ollama provider needs ${MIN_OLLAMA_VERSION} or later, since an older Ollama may cut a long prompt in silence`,
    );
  }
  recentEnough.set(server.url, Date.now() + VERSION_MS);
}

/** Whether `version` (`0.40.13`, `0.41.0-rc1`) is `least` or later; `false` when it cannot be read. */
function isAtLeast(version: string, least: string): boolean {
  const partsOf = (text: string) =>
    /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim())?.slice(1).map(Number);
  const found = partsOf(version);
  const wanted = partsOf(least);
  if (!found || !wanted) return false;
  for (let index = 0; index < 3; index += 1) {
    const [have = 0, need = 0] = [found[index], wanted[index]];
    if (have !== need) return have > need;
  }
  return true;
}

/**
 * One call to `/api/chat`: the answer, or the count of tokens Ollama gave
 * when it refused the prompt for the context.
 */
async function chat(
  server: ProviderServer,
  request: MapoAiProviderRequest,
  system: string,
  budget: Budget,
): Promise<{ answer: MapoAiProviderAnswer } | { counted: number }> {
  const body = {
    model: request.model,
    stream: true,
    think: false,
    truncate: false,
    shift: false,
    format: request.schema,
    options: {
      temperature: 0,
      num_ctx: budget.context,
      num_predict: budget.answer,
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: request.prompt.input },
    ],
  };
  const { signal } = request;
  const response = await callServer(server, "/api/chat", { body, signal });
  if (!response.ok) {
    const message = await errorMessage(response, signal);
    const match = response.status === 400 ? TOO_LONG.exec(message) : null;
    const counted = tokenCount(match ? Number(match[1]) : undefined);
    if (counted !== undefined) return { counted };
    throw statusFailure(response, message, server.name);
  }
  return { answer: await readAnswer(server, response, request, budget) };
}

/**
 * The streamed answer: a JSON object per line, with a piece of the text,
 * and a last one with the counts and why the model stopped.
 */
async function readAnswer(
  server: ProviderServer,
  response: Response,
  request: MapoAiProviderRequest,
  budget: Budget,
): Promise<MapoAiProviderAnswer> {
  let text = "";
  let last: Record<string, unknown> | undefined;
  await readJsonLines(
    response,
    (value) => {
      const piece = isRecord(value) ? value : {};
      if (piece.error !== undefined) {
        throw new MapoAiProviderError(
          "unavailable",
          `${server.name} failed while answering: ${String(piece.error).slice(0, 300)}`,
        );
      }
      const message = isRecord(piece.message) ? piece.message : {};
      // The reasoning, when a model writes some anyway, is not the answer.
      if (typeof message.content === "string") text += message.content;
      if (piece.done !== true) return;
      last = piece;
      return true;
    },
    { signal: request.signal, name: server.name },
  );
  if (!last) {
    throw new MapoAiProviderError(
      "unavailable",
      `${server.name} stopped before the end of its answer`,
    );
  }
  if (last.done_reason === "length") {
    throw new MapoAiProviderError(
      "truncated",
      `${request.model} on ${server.name} reached the most it may write (${budget.answer} tokens, in a context of ${budget.context}): the answer is cut`,
    );
  }
  return {
    status: "answered",
    output: answerOutput(text),
    usage: {
      inputTokens: tokenCount(last.prompt_eval_count) ?? 0,
      outputTokens: tokenCount(last.eval_count) ?? 0,
    },
  };
}

/**
 * What Ollama says about a model (`/api/show`): the most tokens it reads,
 * and whether it sees images. Kept ten minutes.
 * @throws MapoAiProviderError `refused-request` for a model Ollama does not
 *   have; what `serverJson` throws otherwise
 */
async function modelInfo(
  server: ProviderServer,
  model: string,
  signal: AbortSignal,
): Promise<MapoAiModelInfo> {
  const kept = models.get(server.url, model);
  if (kept) return kept;
  const answer = await serverJson(server, "/api/show", {
    body: { model },
    signal,
  });
  const info = infoOf(model, answer);
  models.set(server.url, info);
  return info;
}

/**
 * A model's details, as `/api/show` writes them: the context under a key
 * named for its architecture (`qwen2.context_length`), the capabilities as
 * a list (`vision`).
 */
function infoOf(model: string, answer: unknown): MapoAiModelInfo {
  const details = isRecord(answer) ? answer : {};
  const facts = isRecord(details.model_info) ? details.model_info : {};
  const architecture = facts["general.architecture"];
  const own =
    typeof architecture === "string"
      ? tokenCount(facts[`${architecture}.context_length`])
      : undefined;
  // Without the architecture, the context when the model has only one.
  const lengths = Object.keys(facts)
    .filter((key) => key.endsWith(".context_length"))
    .map((key) => tokenCount(facts[key]))
    .filter((length): length is number => length !== undefined);
  const context = own ?? (lengths.length === 1 ? lengths[0] : undefined);
  const capabilities = Array.isArray(details.capabilities)
    ? details.capabilities
    : [];
  return {
    id: model,
    ...(context !== undefined ? { contextTokens: context } : {}),
    images: capabilities.includes("vision"),
  };
}

function tooLong(
  server: ProviderServer,
  model: string,
  counted: number,
  most: number | undefined,
): MapoAiProviderError {
  const limit =
    most === undefined ? "the context" : `the ${most} tokens ${model} reads`;
  return new MapoAiProviderError(
    "too-long",
    `The prompt takes ${counted} tokens on ${server.name}: with an answer, it does not fit ${limit}`,
  );
}

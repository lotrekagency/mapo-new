/**
 * The HTTP side of Mapo's providers that call a server, such as Ollama, an
 * OpenAI-compatible one, OpenAI or Anthropic: the call, its failures told
 * apart, the text of an error, and an answer streamed line by line. What a
 * server sends is outside data: read as text within a bound, then as
 * `unknown`. `fetch` is passed in, so the tests serve recorded answers.
 */

import { isRecord } from "../../shared/guards";
import { MapoAiProviderError } from "./types";

/** How a provider calls its server: the global `fetch`, or a test's. */
export type ServerFetch = (url: string, init: RequestInit) => Promise<Response>;

/** A server a provider calls. */
export interface ProviderServer {
  /** Its address, without the final `/`. */
  url: string;
  /** Its name in the log: `Ollama at http://localhost:11434`. */
  name: string;
  /** The headers of every call: the key, when there is one. */
  headers: Record<string, string>;
  fetch: ServerFetch;
  /**
   * A server's text without the key: the provider's own key, wherever it
   * appears, and what looks like one ({@link maskKeys}). Every server's
   * text goes through it before a log, since a proxy may repeat the token
   * it refused.
   */
  mask(text: string): string;
}

/** What an error response says, for the log and for telling failures apart. */
export interface ErrorDetails {
  /** The message, in one line, with the key masked; `""` when there is none. */
  message: string;
  /** The error's code, as OpenAI writes it: `insufficient_quota`, `context_length_exceeded`. */
  code?: string;
  /** The error's type, as Anthropic writes it: `rate_limit_error`, `overloaded_error`. */
  type?: string;
  /** The request's parameter the error is about, as OpenAI names it: `reasoning.effort`. */
  param?: string;
}

/** Characters of an error's body read for the log. */
const MAX_ERROR_CHARS = 2000;
/** Characters of a JSON answer that is not streamed, such as a list of models. */
const MAX_JSON_CHARS = 2_000_000;
/**
 * Bytes of a streamed answer read at most: far beyond what a cap on the
 * answer's tokens lets a model write, so only a server that never stops
 * reaches it.
 */
const MAX_STREAM_BYTES = 8_000_000;
/** The longest wait a busy server may ask, in seconds. */
const MAX_RETRY_AFTER = 3600;
/** The codes of Node's `fetch` for a server that took too long. */
const TIMEOUT_CODES = new Set([
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
]);
/**
 * A server's refusal of a prompt for the model's context, as vLLM, the
 * server of llama.cpp, LM Studio, OpenAI and Anthropic word it: Anthropic
 * also refuses a prompt and a cap that together "exceed context limit".
 */
export const CONTEXT_REFUSAL =
  /context[ _](?:length|size|window)|maximum context|exceeds the available context|too many tokens|prompt is too long|exceeds? (?:the )?(?:configured |context )?limit/i;
/**
 * What looks like a key in a server's message: OpenAI repeats the key it
 * refused, masked but for its last characters, and a proxy may repeat a
 * bearer token.
 */
const KEY_LIKE = /\bsk-[\w*-]{6,}|\bBearer\s+[^\s'"]+/gi;
/** The longest code, type or parameter of an error kept for the log. */
const MAX_ERROR_NAME = 80;

/**
 * The server a provider calls, with its key as a bearer token, or in the
 * headers the provider's API asks for it.
 * @param label what it is, for the log: `Ollama`
 * @param settings its address, without the final `/`, and its key
 * @param headers the headers of every call, the key among them, for an API
 *   that takes the key otherwise: Anthropic's `x-api-key`
 */
export function providerServer(
  label: string,
  settings: { baseURL: string; apiKey?: string; fetch?: ServerFetch },
  headers?: Record<string, string>,
): ProviderServer {
  const { apiKey } = settings;
  const bearer: Record<string, string> = apiKey
    ? { authorization: `Bearer ${apiKey}` }
    : {};
  return {
    url: settings.baseURL,
    name: `${label} at ${settings.baseURL}`,
    headers: headers ?? bearer,
    fetch: settings.fetch ?? ((url, init) => fetch(url, init)),
    mask: (text) =>
      maskKeys(apiKey ? text.split(apiKey).join("[a key]") : text),
  };
}

/**
 * Calls the server and returns its response, whatever its status.
 * @param path appended to the server's address: `/api/chat`
 * @param body sent as JSON; without it, a `GET`
 * @param headers of this call only, beside the server's: a beta it asks for
 * @throws MapoAiProviderError `timeout` when the call was given up or timed
 *   out; `unavailable` when the server cannot be reached
 */
export async function callServer(
  server: ProviderServer,
  path: string,
  options: {
    body?: unknown;
    signal: AbortSignal;
    headers?: Record<string, string>;
  },
): Promise<Response> {
  const hasBody = options.body !== undefined;
  const headers = { ...options.headers, ...server.headers };
  const init: RequestInit = {
    method: hasBody ? "POST" : "GET",
    headers: hasBody
      ? { "content-type": "application/json", ...headers }
      : headers,
    // A redirect would send the prompt, and the key, to an address the app
    // did not write: it is answered as a refusal, never followed.
    redirect: "manual",
    signal: options.signal,
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  };
  try {
    return await server.fetch(`${server.url}${path}`, init);
  } catch (error) {
    throw unreachable(error, options.signal, server.name);
  }
}

/**
 * Calls the server and reads its JSON answer, as outside data.
 * @throws MapoAiProviderError for a call that fails, an error status
 *   ({@link statusFailure}) or an answer that is not JSON
 */
export async function serverJson(
  server: ProviderServer,
  path: string,
  options: { body?: unknown; signal: AbortSignal },
): Promise<unknown> {
  const response = await callServer(server, path, options);
  if (!response.ok) {
    const message = await errorMessage(response, options.signal, server.mask);
    throw statusFailure(response, message, server.name);
  }
  const { text, complete } = await readText(
    response,
    MAX_JSON_CHARS,
    options.signal,
    server.name,
  );
  try {
    if (!complete) throw new Error("too long");
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new MapoAiProviderError(
      "invalid-response",
      `${server.name} answered ${path} with no JSON it could read`,
      { cause: error },
    );
  }
}

/**
 * What an error response says, in one line, for the log: the message of a
 * JSON error (`error`, `error.message`, `message`, `detail`, or the first
 * `detail[].msg`), or the first characters of an answer that is not JSON.
 * Nothing else of a JSON body: some servers repeat the request in it, as
 * a validation error that quotes the source. What looks like a key is
 * masked, by `mask` when the caller has the key ({@link maskKeys}
 * otherwise). `""` when it cannot be read.
 */
export async function errorMessage(
  response: Response,
  signal: AbortSignal,
  mask: (text: string) => string = maskKeys,
): Promise<string> {
  return (await errorDetails(response, signal, mask)).message;
}

/**
 * What an error response says, as {@link errorMessage}, with the code,
 * the type and the parameter a JSON error names: OpenAI writes
 * `error.code`, `error.type` and `error.param`, Anthropic `error.type`.
 * They tell failures apart better than the words of the message.
 */
export async function errorDetails(
  response: Response,
  signal: AbortSignal,
  mask: (text: string) => string = maskKeys,
): Promise<ErrorDetails> {
  let text: string;
  try {
    ({ text } = await readText(response, MAX_ERROR_CHARS, signal, ""));
  } catch {
    return { message: "" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not JSON, such as a proxy's page: its first words say what went wrong.
    return { message: mask(text.replace(/\s+/g, " ").trim()).slice(0, 200) };
  }
  const said = messageOf(value);
  const error = isRecord(value) && isRecord(value.error) ? value.error : {};
  const nameOf = (field: unknown) =>
    typeof field === "string" && field !== ""
      ? { value: mask(field).slice(0, MAX_ERROR_NAME) }
      : undefined;
  const code = nameOf(error.code);
  const type = nameOf(error.type);
  const param = nameOf(error.param);
  return {
    message: mask(said.replace(/\s+/g, " ").trim()).slice(0, 500),
    ...(code ? { code: code.value } : {}),
    ...(type ? { type: type.value } : {}),
    ...(param ? { param: param.value } : {}),
  };
}

/**
 * A server's message without what looks like a key: OpenAI's refusal of a
 * key repeats it, masked but for its last characters, and a proxy may
 * repeat a bearer token. The log names the key's variable, never the key.
 */
export function maskKeys(text: string): string {
  return text.replace(KEY_LIKE, "[a key]");
}

/** The message a JSON error writes, in the forms servers use; `""` without one. */
function messageOf(value: unknown): string {
  if (!isRecord(value)) return "";
  const { error, message, detail } = value;
  const firstDetail = Array.isArray(detail) ? detail[0] : undefined;
  const candidates = [
    error,
    isRecord(error) ? error.message : undefined,
    message,
    detail,
    isRecord(firstDetail) ? firstDetail.msg : undefined,
  ];
  const found = candidates.find(
    (candidate): candidate is string => typeof candidate === "string",
  );
  return found ?? "";
}

/**
 * The failure an error status means, for the gateway: 429 is the server
 * asking to slow down, with the seconds of its `Retry-After`; 413 a request
 * too long for the server or a proxy before it; 408 and 504 a server that
 * took too long; any other 5xx a server that failed; a 4xx, or a redirect,
 * which is never followed, a request it refused (a key, a model it does not
 * have, a body).
 */
export function statusFailure(
  response: Response,
  message: string,
  name: string,
): MapoAiProviderError {
  const { status } = response;
  const said = `${name} answered ${status}${message ? `: ${message}` : ""}`;
  if (status === 429) {
    const retryAfter = retryAfterOf(response.headers.get("retry-after"));
    return new MapoAiProviderError(
      "rate-limit",
      said,
      retryAfter === undefined ? {} : { retryAfter },
    );
  }
  if (status === 413) return new MapoAiProviderError("too-long", said);
  const isSlow = status === 408 || status === 504;
  if (isSlow) return new MapoAiProviderError("timeout", said);
  if (status >= 500) return new MapoAiProviderError("unavailable", said);
  const isRedirect = status >= 300 && status < 400;
  if (isRedirect) {
    return new MapoAiProviderError(
      "refused-request",
      `${said} (a redirect, which the provider does not follow)`,
    );
  }
  return new MapoAiProviderError("refused-request", said);
}

/**
 * The seconds a `Retry-After` header asks to wait: a count of seconds, or a
 * date; at most an hour. `undefined` when it says neither.
 */
export function retryAfterOf(
  header: string | null,
  now: number = Date.now(),
): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = /^\d+$/.test(header.trim())
    ? Number(header.trim())
    : (Date.parse(header) - now) / 1000;
  if (!Number.isFinite(seconds)) return undefined;
  return Math.min(Math.max(0, Math.ceil(seconds)), MAX_RETRY_AFTER);
}

/**
 * Reads a streamed body line by line, each as it arrives, without its
 * line break. `onLine` returns `true` to stop reading.
 * @throws MapoAiProviderError `invalid-response` past the bound of an
 *   answer; `timeout` or `unavailable` when the stream breaks; what
 *   `onLine` throws
 */
export async function readLines(
  response: Response,
  onLine: (line: string) => boolean | void,
  options: { signal: AbortSignal; name: string },
): Promise<void> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let read = 0;
  const stop = () => reader.cancel().catch(() => undefined);
  try {
    for (;;) {
      const chunk = await nextChunk(reader, options.signal, options.name);
      if (chunk === undefined) break;
      read += chunk.length;
      if (read > MAX_STREAM_BYTES) {
        throw new MapoAiProviderError(
          "invalid-response",
          `${options.name} sent more than ${MAX_STREAM_BYTES} bytes`,
        );
      }
      // Only a chunk with a line break ends lines: a long line arriving in
      // many chunks is joined once, not split again at each chunk.
      const text = decoder.decode(chunk, { stream: true });
      const end = text.lastIndexOf("\n");
      if (end === -1) {
        pending += text;
        continue;
      }
      const lines = `${pending}${text.slice(0, end)}`.split("\n");
      pending = text.slice(end + 1);
      for (const line of lines) {
        if (onLine(line.replace(/\r$/, "")) === true) {
          await stop();
          return;
        }
      }
    }
    pending += decoder.decode();
    if (pending !== "") onLine(pending.replace(/\r$/, ""));
  } catch (error) {
    await stop();
    throw error;
  }
}

/**
 * Reads a stream of JSON values, one per line, as Ollama sends them.
 * @throws MapoAiProviderError `invalid-response` for a line that is not JSON
 */
export async function readJsonLines(
  response: Response,
  onValue: (value: unknown) => boolean | void,
  options: { signal: AbortSignal; name: string },
): Promise<void> {
  await readLines(
    response,
    (line) => {
      if (line.trim() === "") return;
      return onValue(parseLine(line, options.name));
    },
    options,
  );
}

/**
 * Reads a stream of server-sent events, as an OpenAI-compatible server
 * sends them: the `data` of each event as JSON, until `[DONE]`. An `error:`
 * field, which the server of llama.cpp sends when it fails while it
 * answers, fails the reading with the error's message.
 * @throws MapoAiProviderError `invalid-response` for data that is not JSON;
 *   `unavailable` for an error the server sends in the stream
 */
export async function readEvents(
  response: Response,
  onData: (value: unknown) => boolean | void,
  options: {
    signal: AbortSignal;
    name: string;
    /** What masks the key in an error's message; {@link maskKeys} unless given. */
    mask?: (text: string) => string;
  },
): Promise<void> {
  const mask = options.mask ?? maskKeys;
  let data: string[] = [];
  let done = false;
  const dispatch = (): boolean => {
    if (!data.length) return false;
    const text = data.join("\n");
    data = [];
    if (text.trim() === "[DONE]") {
      done = true;
      return true;
    }
    return onData(parseLine(text, options.name)) === true;
  };
  await readLines(
    response,
    (line) => {
      if (line === "") return dispatch();
      // A comment, such as a server's keep-alive.
      if (line.startsWith(":")) return;
      if (line.startsWith("error:")) {
        const said = mask(messageOf(parseQuietly(line.slice("error:".length))));
        throw new MapoAiProviderError(
          "unavailable",
          `${options.name} failed while answering${said ? `: ${said.slice(0, 300)}` : ""}`,
        );
      }
      if (!line.startsWith("data:")) return;
      const value = line.slice("data:".length);
      data.push(value.startsWith(" ") ? value.slice(1) : value);
    },
    options,
  );
  if (!done) dispatch();
}

/** JSON when the text is JSON; `undefined` otherwise. */
function parseQuietly(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

function parseLine(text: string, name: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new MapoAiProviderError(
      "invalid-response",
      `${name} sent a line that is not JSON`,
      { cause: error },
    );
  }
}

/** The next chunk of a stream; `undefined` at its end. */
async function nextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  name: string,
): Promise<Uint8Array | undefined> {
  try {
    const { done, value } = await reader.read();
    return done ? undefined : value;
  } catch (error) {
    throw unreachable(error, signal, name);
  }
}

/** A body as text, up to `max` characters; `complete` when it ended within them. */
async function readText(
  response: Response,
  max: number,
  signal: AbortSignal,
  name: string,
): Promise<{ text: string; complete: boolean }> {
  let text = "";
  let complete = true;
  await readLines(
    response,
    (line) => {
      text += text === "" ? line : `\n${line}`;
      if (text.length <= max) return;
      text = text.slice(0, max);
      complete = false;
      return true;
    },
    { signal, name },
  );
  return { text, complete };
}

/**
 * The failure of a call that got no answer: given up or timed out, or a
 * server that cannot be reached.
 */
function unreachable(
  error: unknown,
  signal: AbortSignal,
  name: string,
): MapoAiProviderError {
  if (error instanceof MapoAiProviderError) return error;
  const code = codeOf(error);
  // Node's `fetch` waits five minutes for a server's first bytes. A server
  // that streams, as Ollama does, sends them with the first words of the
  // answer: after loading the model and reading the whole prompt.
  const isHeadersLate = code === "UND_ERR_HEADERS_TIMEOUT" && !signal.aborted;
  if (isHeadersLate) {
    return new MapoAiProviderError(
      "timeout",
      `${name} sent nothing back within the time Node's fetch waits for a server's first bytes, 300 seconds: loading the model and reading the prompt took longer`,
      { cause: error },
    );
  }
  const isSlow = signal.aborted || TIMEOUT_CODES.has(code);
  if (isSlow) {
    return new MapoAiProviderError(
      "timeout",
      `${name} did not answer in time`,
      {
        cause: error,
      },
    );
  }
  return new MapoAiProviderError(
    "unavailable",
    `${name} cannot be reached${code ? ` (${code})` : ""}`,
    { cause: error },
  );
}

/** The code of a failed `fetch`: Node puts the system's error in `cause`. */
function codeOf(error: unknown): string {
  const cause = isRecord(error) ? error.cause : undefined;
  const code = isRecord(cause) ? cause.code : undefined;
  if (typeof code === "string") return code;
  const own = isRecord(error) ? error.code : undefined;
  return typeof own === "string" ? own : "";
}

/**
 * The browser's half of `read` and `read/link`: a file sent to the gateway
 * as a form, a link as JSON, and the answers read as outside data. Pure:
 * the call to the server is passed in.
 */

import { MAPO_AI_GATEWAY_PATH } from "./gateway";
import type {
  MapoAiLinkBlock,
  MapoAiLinkFailure,
  MapoAiReadLinkRequest,
  MapoAiReadLinkResponse,
  MapoAiReadResponse,
  MapoAiSourcePart,
} from "./gateway";
import { isRecord } from "./guards";

/** What {@link readMapoAiFile} needs from the app. */
export interface MapoAiReadDependencies {
  /**
   * Posts a body to a path of the app's server and resolves with the
   * answer read as JSON, rejecting on an error status: `$mapoFetch` in a
   * Mapo app.
   */
  post(
    path: string,
    body: FormData,
    options: { signal?: AbortSignal },
  ): Promise<unknown>;
}

/** What one call of {@link readMapoAiFile} takes besides the file. */
export interface MapoAiReadOptions {
  /** The file's name, when the file is a `Blob` without one. */
  name?: string;
  /** Stops waiting for the answer. */
  signal?: AbortSignal;
}

/** The server answered something that is no answer of `read`. */
export class MapoAiReadAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapoAiReadAnswerError";
  }
}

/**
 * Sends a file to the gateway, which reads it into the parts of a source,
 * as `run` takes them; the answer says why there are none when there are
 * none.
 * @throws The rejection of `post` (an error status: 413 for a file larger
 *   than `maxFileBytes`, 415, 400, 401, 403; a network failure; an abort),
 *   or {@link MapoAiReadAnswerError} when the answer cannot be read.
 */
export async function readMapoAiFile(
  file: Blob,
  dependencies: MapoAiReadDependencies,
  options: MapoAiReadOptions = {},
): Promise<MapoAiReadResponse> {
  const form = new FormData();
  const name = options.name ?? (file instanceof File ? file.name : "file");
  form.append("file", file, name);
  const answer = await dependencies.post(`${MAPO_AI_GATEWAY_PATH}/read`, form, {
    signal: options.signal,
  });
  const response = readMapoAiReadResponse(answer);
  if (!response) {
    throw new MapoAiReadAnswerError(
      "The server's answer is not an answer of read",
    );
  }
  return response;
}

/** The answer of `read`, read as outside data; `undefined` when it is none. */
export function readMapoAiReadResponse(
  value: unknown,
): MapoAiReadResponse | undefined {
  const answer = isRecord(value) ? value : {};
  const reader =
    typeof answer.reader === "string" && answer.reader !== ""
      ? answer.reader
      : undefined;
  if (answer.status === "unsupported") return { status: "unsupported" };
  if (!reader) return undefined;
  if (answer.status === "empty") return { status: "empty", reader };
  if (answer.status === "failed") return { status: "failed", reader };
  if (answer.status === "too-long") {
    const chars = answer.chars;
    const isCount = Number.isInteger(chars) && Number(chars) >= 0;
    return isCount
      ? { status: "too-long", reader, chars: Number(chars) }
      : undefined;
  }
  if (answer.status !== "read") return undefined;
  const entries: unknown[] = Array.isArray(answer.parts) ? answer.parts : [];
  const parts = entries.flatMap((entry): MapoAiSourcePart[] => {
    const part = isRecord(entry) ? entry : {};
    const isText = part.kind === "text" && typeof part.text === "string";
    if (!isText) return [];
    const name = typeof part.name === "string" ? { name: part.name } : {};
    return [{ kind: "text", text: String(part.text), ...name }];
  });
  return parts.length ? { status: "read", reader, parts } : undefined;
}

// ─── read/link ───────────────────────────────────────────────────────────────

const BLOCKS = new Set<string>([
  "scheme",
  "credentials",
  "port",
  "address",
  "denied",
]);
const FAILURES = new Set<string>([
  "dns",
  "connection",
  "tls",
  "timeout",
  "redirects",
]);

/** What {@link readMapoAiLink} needs from the app. */
export interface MapoAiReadLinkDependencies {
  /**
   * Posts a body to a path of the app's server as JSON and resolves with
   * the answer read as JSON, rejecting on an error status: `$mapoFetch` in
   * a Mapo app.
   */
  post(
    path: string,
    body: MapoAiReadLinkRequest,
    options: { signal?: AbortSignal },
  ): Promise<unknown>;
}

/**
 * Whether a text is a link the gateway may read: an address of the web,
 * `http:` or `https:`. The gateway checks it again, with its own rules.
 */
export function isMapoAiLink(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Sends a link to the gateway, which fetches its page and reads it into
 * the parts of a source, as `run` takes them; the answer says why there
 * are none when there are none.
 * @throws The rejection of `post` (an error status: 429 past the user's
 *   limit of links, 400, 401, 403; a network failure; an abort), or
 *   {@link MapoAiReadAnswerError} when the answer cannot be read.
 */
export async function readMapoAiLink(
  url: string,
  dependencies: MapoAiReadLinkDependencies,
  options: { signal?: AbortSignal } = {},
): Promise<MapoAiReadLinkResponse> {
  const answer = await dependencies.post(
    `${MAPO_AI_GATEWAY_PATH}/read/link`,
    { url },
    { signal: options.signal },
  );
  const response = readMapoAiReadLinkResponse(answer);
  if (!response) {
    throw new MapoAiReadAnswerError(
      "The server's answer is not an answer of read/link",
    );
  }
  return response;
}

/** The answer of `read/link`, read as outside data; `undefined` when it is none. */
export function readMapoAiReadLinkResponse(
  value: unknown,
): MapoAiReadLinkResponse | undefined {
  const answer = isRecord(value) ? value : {};
  const { status, reason } = answer;
  if (status === "off") return { status: "off" };
  if (status === "blocked") {
    return isBlock(reason) ? { status, reason } : undefined;
  }
  if (status === "unreachable") {
    return isFailure(reason) ? { status, reason } : undefined;
  }
  if (status === "http-error") {
    const code = answer.httpStatus;
    const isCode =
      typeof code === "number" &&
      Number.isInteger(code) &&
      code >= 100 &&
      code <= 599;
    return isCode ? { status, httpStatus: code } : undefined;
  }
  if (status === "too-large") {
    const max = answer.maxBytes;
    const isCount = Number.isInteger(max) && Number(max) >= 0;
    return isCount ? { status, maxBytes: Number(max) } : undefined;
  }
  const read = readMapoAiReadResponse(value);
  if (read?.status !== "read") return read;
  const url = typeof answer.url === "string" ? answer.url : "";
  return isMapoAiLink(url) ? { ...read, url } : undefined;
}

function isBlock(value: unknown): value is MapoAiLinkBlock {
  return typeof value === "string" && BLOCKS.has(value);
}

function isFailure(value: unknown): value is MapoAiLinkFailure {
  return typeof value === "string" && FAILURES.has(value);
}

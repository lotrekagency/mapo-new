/**
 * `read/link`, the operation: a link checked by the rules, its page fetched
 * by Mapo or by the app's fetcher, then read as a file is read, by the
 * reader of its format with the app's `mapo-ai:read` hooks (`read.ts`).
 * What a fetcher answers is outside data, since it may be the app's code.
 * Its dependencies are passed in, and `nitro.ts` wires them to the server.
 */

import type {
  MapoAiLinkBlock,
  MapoAiLinkFailure,
  MapoAiReadLinkResponse,
} from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { readSourceFile } from "../readers/read";
import type { ReadDependencies } from "../readers/read";
import { MAPO_AI_LINK_READER } from "../readers/registry";
import type { MapoAiRunOptions } from "../run/options";
import { linkRulesOf, linkUrl, pageNameOf, refusalOf } from "./rules";
import type { MapoAiLinkRules } from "./rules";
import type { MapoAiFetchedPage, MapoAiFetcher } from "./types";

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
/** Characters of a media type kept. */
const MAX_TYPE = 200;

/**
 * Whether the app reads links: the `link` reader is not turned off, a page
 * may have bytes and a user may read one, and `deny` does not keep every
 * host out.
 */
export function linksAreOn(options: MapoAiRunOptions): boolean {
  const isReaderOn = options.readers[MAPO_AI_LINK_READER] !== false;
  const isEveryHostDenied = linkRulesOf(options.web).deny.some(
    (pattern) => pattern.host === "*",
  );
  const { maxFileBytes, linksPerUserPerMinute } = options.limits;
  return (
    isReaderOn &&
    !isEveryHostDenied &&
    maxFileBytes > 0 &&
    linksPerUserPerMinute > 0
  );
}

/** What {@link readSourceLink} needs from the server. */
export interface LinkDependencies {
  /** Whether the app reads links: the `link` reader is on, and the limits let a page be read. */
  isOn: boolean;
  /** The hosts the app opens and keeps out. */
  rules: MapoAiLinkRules;
  /** Seconds a page may take, its redirects included. */
  timeout: number;
  /** Bytes a page may have: `limits.maxFileBytes`. */
  maxBytes: number;
  /** The operator's languages, as their browser asks for them. */
  languages?: string;
  /** The fetcher: the app's, or Mapo's. */
  fetcher: MapoAiFetcher;
  /** What reads a page once it is fetched, as `read` reads a file. */
  read: ReadDependencies;
  /** Counts a page against the user's limit: it throws past it. */
  count(): void;
}

/**
 * Reads the page of a link into the parts of a source: `off` when the app
 * reads no link; `blocked` when the rules refuse it, before it is counted
 * or fetched; then what its fetch and its reading answer, with the
 * page's address on `read`.
 * @throws The error of `count()`, past the user's limit
 */
export async function readSourceLink(
  link: string,
  deps: LinkDependencies,
  options: { signal?: AbortSignal } = {},
): Promise<MapoAiReadLinkResponse> {
  if (!deps.isOn) return { status: "off" };
  const url = linkUrl(link);
  if (!url) return { status: "blocked", reason: "scheme" };
  const refusal = refusalOf(url, deps.rules);
  if (refusal) {
    console.warn(
      `[mapo-ai] A link to ${url.host || "an address"} is refused: ${refusal}.`,
    );
    return { status: "blocked", reason: refusal };
  }
  deps.count();

  const signals = [AbortSignal.timeout(deps.timeout * 1000)];
  if (options.signal) signals.push(options.signal);
  let fetched: unknown;
  try {
    fetched = await deps.fetcher.fetch({
      url: url.href,
      maxBytes: deps.maxBytes,
      signal: AbortSignal.any(signals),
      ...(deps.languages ? { languages: deps.languages } : {}),
    });
  } catch (error) {
    console.warn(
      `[mapo-ai] The fetcher "${deps.fetcher.label ?? "of the app"}" could not fetch a page of ${url.host}: ${describe(error)}`,
    );
    return { status: "unreachable", reason: "connection" };
  }
  const page = pageOf(fetched, url, deps.maxBytes);
  if ("status" in page) {
    if (page.status === "blocked") {
      console.warn(
        `[mapo-ai] A link to ${url.host} is refused on its way: ${page.reason}.`,
      );
    }
    return page;
  }
  const read = await readSourceFile(
    {
      name: pageNameOf(new URL(page.url)),
      type: page.type,
      bytes: page.bytes,
      url: page.url,
    },
    deps.read,
  );
  return read.status === "read" ? { ...read, url: page.url } : read;
}

/**
 * What a fetcher answered, read as outside data: the page, its bytes no
 * more than `maxBytes` and its address one of the web's (the link's
 * otherwise); or why there is none. An answer that is neither is
 * `unreachable`, and the log says so.
 */
function pageOf(
  value: unknown,
  requested: URL,
  maxBytes: number,
): MapoAiFetchedPage | Exclude<MapoAiReadLinkResponse, { reader: string }> {
  const answer = isRecord(value) ? value : {};
  const { status, reason } = answer;
  if (status === "blocked" && isBlock(reason)) return { status, reason };
  if (status === "unreachable" && isFailure(reason)) return { status, reason };
  if (status === "http-error") {
    const code = answer.httpStatus;
    const isCode =
      typeof code === "number" &&
      Number.isInteger(code) &&
      code >= 100 &&
      code <= 599;
    return isCode
      ? { status, httpStatus: code }
      : { status: "unreachable", reason: "connection" };
  }
  if (status === "too-large") return { status, maxBytes };
  const bytes = answer.bytes;
  if (!(bytes instanceof Uint8Array)) {
    console.warn(
      `[mapo-ai] A fetcher answered no page for ${requested.host}: no bytes, and no status it may give.`,
    );
    return { status: "unreachable", reason: "connection" };
  }
  if (bytes.byteLength > maxBytes) return { status: "too-large", maxBytes };
  const address =
    typeof answer.url === "string" ? linkUrl(answer.url) : undefined;
  const isWeb = address?.protocol === "http:" || address?.protocol === "https:";
  const type = typeof answer.type === "string" ? answer.type : "";
  return {
    url: isWeb && address ? address.href : requested.href,
    type: type.slice(0, MAX_TYPE),
    bytes,
  };
}

function isBlock(value: unknown): value is MapoAiLinkBlock {
  return typeof value === "string" && BLOCKS.has(value);
}

function isFailure(value: unknown): value is MapoAiLinkFailure {
  return typeof value === "string" && FAILURES.has(value);
}

/** An error, for the server's log: one line, a few hundred characters at most. */
function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 300);
}

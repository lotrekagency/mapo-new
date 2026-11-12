/**
 * Mapo's way of fetching the page of a link, on Node: the request, and the
 * half of the guard that needs the network.
 *
 * A host's addresses are checked by the `lookup` the connection itself
 * uses, so the address checked is the address connected to: a name that
 * resolves to a public address for a check and to a private one for the
 * connection (DNS rebinding) never reaches the private one. When a name
 * leads to any address no page of the web has, the server itself, a
 * private network, the cloud's metadata or a reserved range, the link is
 * `blocked` before a connection opens. An address written in the link is
 * checked before, since a connection to an address looks nothing up. A
 * host the app opens (`mapo.ai.web.allow`) is not checked.
 *
 * Every redirect goes through the rules again (`rules.ts`), and the sixth
 * is never followed. The request carries no cookie, no credentials and no
 * referrer: the page is read as a stranger reads it. Its bytes are counted
 * as they come and as they unzip, up to `maxBytes`.
 *
 * It uses Node's `http`, `https`, `dns`, `net` and `zlib`: `nitro.ts`
 * imports it only when a page is read, so a server without them fails then,
 * not when it starts.
 */

import type { LookupAddress } from "node:dns";
import { Resolver } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { promisify } from "node:util";
import { brotliDecompress, gunzip, inflate, inflateRaw } from "node:zlib";
import { isHopOpened, refusalOf } from "./rules";
import type { MapoAiLinkRules } from "./rules";
import type { MapoAiFetchRequest, MapoAiFetchResult } from "./types";

/** Redirects followed at most: the sixth is never asked for. */
export const MAX_REDIRECTS = 5;

/**
 * IPv4's addresses no page of the web has (IANA's registry of
 * special-purpose addresses): this network, private networks, shared
 * addresses (CGNAT), loopback, link-local (the cloud's metadata),
 * protocol assignments, documentation, the old 6to4 relay, benchmarking,
 * multicast and the reserved range with the broadcast address.
 */
const SPECIAL_IPV4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/**
 * IPv6's: unspecified, loopback and the old IPv4-compatible addresses
 * (`::/96`), IPv4 translated by SIIT (`::ffff:0:0:0/96`), NAT64 for local
 * use, discard, protocol assignments (Teredo included), documentation,
 * 6to4, segment routing, unique local, link-local, site-local and
 * multicast. An IPv4 address written as IPv6
 * (`::ffff:127.0.0.1`) is checked as IPv4 by the list itself, and one inside
 * NAT64's well-known prefix (`64:ff9b::/96`) as the IPv4 address it holds.
 */
const SPECIAL_IPV6: readonly (readonly [string, number])[] = [
  ["::", 96],
  ["::ffff:0:0:0", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

const special = new BlockList();
for (const [network, prefix] of SPECIAL_IPV4) {
  special.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of SPECIAL_IPV6) {
  special.addSubnet(network, prefix, "ipv6");
}
const nat64 = new BlockList();
nat64.addSubnet("64:ff9b::", 96, "ipv6");

/** The code of the error a connection fails with when the guard refuses its host's addresses. */
const BLOCKED = "MAPO_AI_ADDRESS_BLOCKED";
/** The statuses of a redirect the request follows, when it says where to. */
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
/** Seconds a DNS query of a guarded name may take, and how many times it is asked. */
const DNS_TIMEOUT_MS = 3000;
const DNS_TRIES = 2;
/** The codes of a name that could not be resolved: `getaddrinfo`'s and c-ares'. */
const DNS_CODES = new Set([
  "ENOTFOUND",
  "ENODATA",
  "ESERVFAIL",
  "EREFUSED",
  "ETIMEOUT",
  "EFORMERR",
  "EBADNAME",
  "EBADRESP",
  "ENOTIMP",
  "EAI_AGAIN",
  "EAI_FAIL",
  "EAI_NODATA",
  "EAI_NONAME",
]);
const TLS_CODE =
  /^(?:ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|EPROTO$)/;
/** What the request accepts: a page first, then any text, then anything a reader may read. */
const ACCEPT =
  "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5";

type Unzip = (
  bytes: Uint8Array,
  options: { maxOutputLength: number },
) => Promise<Buffer>;
const gunzipped: Unzip = promisify(gunzip);
const inflated: Unzip = promisify(inflate);
const rawInflated: Unzip = promisify(inflateRaw);
const brotliDecompressed: Unzip = promisify(brotliDecompress);

/**
 * Resolves a host's addresses, every one: DNS's (`resolveWithDns`), or a
 * test's own.
 */
export type Resolve = (
  hostname: string,
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: LookupAddress[],
  ) => void,
) => void;

/**
 * A name's IPv4 and IPv6 addresses, asked of DNS by c-ares, with a timeout
 * of its own. Unlike `dns.lookup()`, c-ares does not take one of libuv's
 * four threads for each name, so names that answer slowly, on purpose or
 * not, never stall the files, the crypto and the unzipping of the whole
 * server. It reads no hosts file: a name only the server's `/etc/hosts`
 * knows is not found, unless the app opens it (`allow`).
 */
const resolveWithDns: Resolve = (hostname, callback) => {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES });
  void Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]).then(([ipv4, ipv6]) => {
    const addresses: LookupAddress[] = [
      ...(ipv4.status === "fulfilled"
        ? ipv4.value.map((address) => ({ address, family: 4 }))
        : []),
      ...(ipv6.status === "fulfilled"
        ? ipv6.value.map((address) => ({ address, family: 6 }))
        : []),
    ];
    if (addresses.length) return callback(null, addresses);
    const failed = [ipv4, ipv6].find((one) => one.status === "rejected");
    const reason: unknown =
      failed?.status === "rejected" ? failed.reason : undefined;
    const code = codeOf(reason) || "ENOTFOUND";
    callback(
      Object.assign(new Error(`No address of ${hostname}: ${code}`), { code }),
      [],
    );
  });
};

/** What {@link fetchPage} needs besides the request. */
export interface PageFetchOptions {
  /** The hosts the app opens and keeps out. */
  rules: MapoAiLinkRules;
  /** What the request names as its client. */
  userAgent: string;
  /** Resolves a host's addresses: `dns.lookup()` unless a test passes its own. */
  resolve?: Resolve;
}

/**
 * Whether an address is one a page of the web may have: none of the
 * special-purpose ranges, an IPv4 address inside NAT64 read as itself. An
 * address that cannot be read is none.
 */
export function isPublicAddress(address: string): boolean {
  const plain = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = isIP(plain);
  if (family === 4) return !special.check(plain, "ipv4");
  if (family !== 6) return false;
  if (nat64.check(plain, "ipv6")) {
    const inside = nat64Ipv4(plain);
    return inside !== undefined && isPublicAddress(inside);
  }
  return !special.check(plain, "ipv6");
}

/** The IPv4 address an IPv6 address of NAT64 holds in its last 32 bits. */
function nat64Ipv4(address: string): string | undefined {
  const groups = ipv6Groups(address);
  if (!groups) return undefined;
  const [high = 0, low = 0] = groups.slice(6);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

/** The eight groups of an IPv6 address `isIP()` has read already. */
function ipv6Groups(address: string): number[] | undefined {
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return undefined;
  const numbers = (half: string | undefined): number[] =>
    (half ? half.split(":") : []).flatMap((part) => {
      if (!part.includes(".")) return [Number.parseInt(part, 16)];
      const [a = 0, b = 0, c = 0, d = 0] = part.split(".").map(Number);
      return [(a << 8) | b, (c << 8) | d];
    });
  const head = numbers(halves[0]);
  const tail = numbers(halves[1]);
  const gap = 8 - head.length - tail.length;
  const isCompressed = halves.length === 2;
  const isWhole = isCompressed ? gap >= 0 : gap === 0;
  if (!isWhole) return undefined;
  return [
    ...head,
    ...new Array<number>(isCompressed ? gap : 0).fill(0),
    ...tail,
  ];
}

/**
 * Fetches the page of a link, following its redirects: its bytes,
 * unzipped, with its media type and the address it came from; or why
 * there are none.
 */
export async function fetchPage(
  request: MapoAiFetchRequest,
  options: PageFetchOptions,
): Promise<MapoAiFetchResult> {
  let url = new URL(request.url);
  let from: { url: URL; isOpened: boolean } | undefined;
  for (let hop = 0; ; hop += 1) {
    const isOpened = isHopOpened(url, options.rules, from);
    const refusal =
      refusalOf(url, options.rules) ?? addressRefusal(url, isOpened);
    if (refusal) return { status: "blocked", reason: refusal };
    let response: IncomingMessage;
    try {
      response = await requestOnce(url, request, options, isOpened);
    } catch (error) {
      return failureOf(error, request.signal);
    }
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    const isRedirect = REDIRECTS.has(status) && typeof location === "string";
    if (isRedirect) {
      response.destroy();
      if (hop >= MAX_REDIRECTS) {
        return { status: "unreachable", reason: "redirects" };
      }
      const next = nextUrl(location, url);
      if (!next) return { status: "blocked", reason: "scheme" };
      from = { url, isOpened };
      url = next;
      continue;
    }
    const isOk = status >= 200 && status < 300;
    if (!isOk) {
      response.destroy();
      return { status: "http-error", httpStatus: status };
    }
    return pageOf(response, url, request);
  }
}

/**
 * Why an address written in a link is refused: it is no address a page of
 * the web may have, and the app does not leave the hop to itself. A name is
 * checked when the connection resolves it.
 */
function addressRefusal(url: URL, isOpened: boolean): "address" | undefined {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const isAddress = isIP(host) !== 0;
  if (!isAddress || isOpened) return undefined;
  return isPublicAddress(host) ? undefined : "address";
}

/** The address a redirect leads to, read against the page's; `undefined` when it is none. */
function nextUrl(location: string, from: URL): URL | undefined {
  try {
    return new URL(location, from);
  } catch {
    return undefined;
  }
}

/** One request, without its redirects: its response, headers read, body not yet. */
function requestOnce(
  url: URL,
  request: MapoAiFetchRequest,
  options: PageFetchOptions,
  isOpened: boolean,
): Promise<IncomingMessage> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const lookup = isOpened
    ? {}
    : { lookup: guardedLookup(options.resolve ?? resolveWithDns) };
  return new Promise((resolve, reject) => {
    const outgoing = send(
      url,
      {
        method: "GET",
        // A connection of its own: never one an agent keeps for another request.
        agent: false,
        signal: request.signal,
        headers: {
          "user-agent": options.userAgent,
          accept: ACCEPT,
          "accept-encoding": "gzip, deflate, br",
          ...(request.languages
            ? { "accept-language": request.languages }
            : {}),
        },
        ...lookup,
      },
      resolve,
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}

/**
 * The `lookup` of a connection that the guard watches: it resolves every
 * address of the host, and fails with `BLOCKED` when one of them is no
 * address of the web, before the connection opens. It answers as Node asks:
 * all the addresses when Node tries them in turn, one otherwise.
 */
export function guardedLookup(resolve: Resolve) {
  return (
    hostname: string,
    options: { family?: number | string; all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    resolve(hostname, (error, addresses) => {
      if (error) return callback(error, "");
      const isEveryPublic =
        addresses.length > 0 &&
        addresses.every((one) => isPublicAddress(one.address));
      if (!isEveryPublic) return callback(blockedError(), "");
      const family = familyOf(options.family);
      const usable = family
        ? addresses.filter((one) => one.family === family)
        : addresses;
      const [first] = usable;
      if (!first) return callback(notFound(hostname), "");
      if (options.all) return callback(null, usable);
      callback(null, first.address, first.family);
    });
  };
}

function familyOf(value: number | string | undefined): 4 | 6 | undefined {
  if (value === 4 || value === "IPv4") return 4;
  if (value === 6 || value === "IPv6") return 6;
  return undefined;
}

function blockedError(): NodeJS.ErrnoException {
  return Object.assign(
    new Error("The host leads to an address no page of the web has"),
    { code: BLOCKED },
  );
}

function notFound(hostname: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`No address of ${hostname} to connect to`), {
    code: "ENOTFOUND",
  });
}

/** The page of a response: its bytes up to `maxBytes`, unzipped up to `maxBytes`. */
async function pageOf(
  response: IncomingMessage,
  url: URL,
  request: MapoAiFetchRequest,
): Promise<MapoAiFetchResult> {
  const declared = Number(response.headers["content-length"]);
  const isDeclaredLarger =
    Number.isFinite(declared) && declared > request.maxBytes;
  if (isDeclaredLarger) {
    response.destroy();
    return { status: "too-large" };
  }
  let raw: Uint8Array | undefined;
  try {
    raw = await bytesOf(response, request.maxBytes);
  } catch (error) {
    return failureOf(error, request.signal);
  }
  if (!raw) return { status: "too-large" };
  const encoding = String(response.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  let bytes: Uint8Array;
  try {
    bytes = await unzipped(raw, encoding, request.maxBytes);
  } catch (error) {
    const isTooLarge =
      error instanceof RangeError || codeOf(error) === "ERR_BUFFER_TOO_LARGE";
    if (isTooLarge) return { status: "too-large" };
    return { status: "unreachable", reason: "connection" };
  }
  const type = response.headers["content-type"];
  return {
    url: url.href,
    type: typeof type === "string" ? type : "",
    bytes,
  };
}

/**
 * A response's body, counted as it comes: `undefined` as soon as it has
 * more than `maxBytes`, and the connection closes.
 */
function bytesOf(
  response: IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    response.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve(undefined);
        response.destroy();
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () =>
      resolve(new Uint8Array(Buffer.concat(chunks, total))),
    );
    response.on("error", reject);
    // Closed before its end: the connection broke, or the request stopped.
    response.on("close", () => {
      if (!response.complete) reject(new Error("The response was cut"));
    });
  });
}

/**
 * A body unzipped as its `content-encoding` says, up to `maxBytes`: past
 * them the unzipping stops with a `RangeError`. A `deflate` body may come
 * with zlib's wrapping or without it, as some servers send it; an encoding
 * the request did not ask for is left as it is, for the reader to refuse.
 */
async function unzipped(
  bytes: Uint8Array,
  encoding: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const options = { maxOutputLength: maxBytes };
  let unzip: Unzip | undefined;
  if (encoding === "gzip" || encoding === "x-gzip") unzip = gunzipped;
  else if (encoding === "br") unzip = brotliDecompressed;
  else if (encoding === "deflate") unzip = inflatedEither;
  if (!unzip) return bytes;
  const buffer = await unzip(bytes, options);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** A `deflate` body, with zlib's wrapping or without it, as some servers send it. */
const inflatedEither: Unzip = async (bytes, options) => {
  try {
    return await inflated(bytes, options);
  } catch (error) {
    if (error instanceof RangeError) throw error;
    return rawInflated(bytes, options);
  }
};

/** Why a request failed, as the gateway says it. */
function failureOf(error: unknown, signal: AbortSignal): MapoAiFetchResult {
  const code = codeOf(error);
  if (code === BLOCKED) return { status: "blocked", reason: "address" };
  if (signal.aborted) {
    const isTimeout = nameOf(signal.reason) === "TimeoutError";
    return {
      status: "unreachable",
      reason: isTimeout ? "timeout" : "connection",
    };
  }
  if (DNS_CODES.has(code)) return { status: "unreachable", reason: "dns" };
  if (TLS_CODE.test(code)) return { status: "unreachable", reason: "tls" };
  return { status: "unreachable", reason: "connection" };
}

/** The `code` of an error, as Node writes it: `ENOTFOUND`; `""` for none. */
function codeOf(error: unknown): string {
  const isObject = typeof error === "object" && error !== null;
  const code: unknown = isObject ? Reflect.get(error, "code") : undefined;
  return typeof code === "string" ? code : "";
}

/** The `name` of an error, or of the reason a signal was aborted with. */
function nameOf(value: unknown): string {
  const isObject = typeof value === "object" && value !== null;
  const name: unknown = isObject ? Reflect.get(value, "name") : undefined;
  return typeof name === "string" ? name : "";
}

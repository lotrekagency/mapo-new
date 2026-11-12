/**
 * The rules of the links `read/link` reads, before any connection: what an
 * address may be, and the hosts the app opens (`mapo.ai.web.allow`) or
 * keeps out (`mapo.ai.web.deny`). Pure: the other half of the guard, the
 * addresses a host leads to, is checked when the connection opens
 * (`node.ts`).
 */

import type { MapoAiLinkBlock } from "../../shared/gateway";

/**
 * A host as `allow` and `deny` write it: `example.org`, `*.example.org`
 * for its subdomains, `localhost:3000` with a port, `*` for every host.
 */
export interface HostPattern {
  /** The host, as the address parser writes it: lowercase, an IPv6 address between brackets; `*` for every host. */
  host: string;
  /** Whether it stands for the host's subdomains (`*.example.org`), not for the host itself. */
  subdomains: boolean;
  /** The port it names, besides the web's; none for those. */
  port?: string;
}

/** The hosts the app opens and keeps out, read. */
export interface MapoAiLinkRules {
  allow: readonly HostPattern[];
  deny: readonly HostPattern[];
}

/** The ports an address may name without the app opening them: the web's. */
const WEB_PORTS = new Set(["", "80", "443"]);

/**
 * A host pattern, read from what an app writes; `undefined` when it is
 * none: a scheme, a path, a user or anything else than a host and a port.
 */
export function hostPatternOf(entry: string): HostPattern | undefined {
  const written = entry.trim().toLowerCase();
  if (written === "*") return { host: "*", subdomains: false };
  const subdomains = written.startsWith("*.");
  const host = subdomains ? written.slice(2) : written;
  const hasOtherParts = /[/?#@\\\s*]/.test(host);
  if (!host || hasOtherParts) return undefined;
  try {
    const url = new URL(`http://${host}`);
    const name = hostNameOf(url);
    if (!name) return undefined;
    return {
      host: name,
      subdomains,
      ...(url.port ? { port: url.port } : {}),
    };
  } catch {
    return undefined;
  }
}

/** The rules of `mapo.ai.web`: its hosts read, those that cannot be read left out. */
export function linkRulesOf(web: {
  allow: readonly string[];
  deny: readonly string[];
}): MapoAiLinkRules {
  return { allow: hostPatternsOf(web.allow), deny: hostPatternsOf(web.deny) };
}

/** The patterns of the hosts an app writes, those that cannot be read left out. */
export function hostPatternsOf(entries: readonly string[]): HostPattern[] {
  return entries.flatMap((entry) => {
    const pattern = hostPatternOf(entry);
    return pattern ? [pattern] : [];
  });
}

/**
 * An address as a browser reads it, from what an operator writes:
 * `undefined` when it is no address at all.
 */
export function linkUrl(text: string): URL | undefined {
  try {
    return new URL(text.trim());
  } catch {
    return undefined;
  }
}

/**
 * Why the gateway refuses an address before it asks for it; `undefined`
 * when it may ask. It takes an address of the web (`http:`, `https:`),
 * with no user or password, on a port of the web or one the app opens for
 * its host, of a host the app does not keep out. `deny` wins over `allow`.
 */
export function refusalOf(
  url: URL,
  rules: MapoAiLinkRules,
): MapoAiLinkBlock | undefined {
  const isWeb = url.protocol === "http:" || url.protocol === "https:";
  if (!isWeb) return "scheme";
  const hasCredentials = url.username !== "" || url.password !== "";
  if (hasCredentials) return "credentials";
  const isDenied = rules.deny.some((pattern) => {
    const isPort = pattern.port === undefined || pattern.port === portOf(url);
    return isPort && isHostOf(pattern, url);
  });
  if (isDenied) return "denied";
  const isWebPort = WEB_PORTS.has(url.port);
  const isPortOpened = rules.allow.some(
    (pattern) => pattern.port === url.port && isHostOf(pattern, url),
  );
  if (!isWebPort && !isPortOpened) return "port";
  return undefined;
}

/**
 * Whether the app opens an address (`allow`): its host, on the port the
 * pattern names, or on the web's when it names none. The addresses such a
 * host leads to are not checked: a host of a private network, or the
 * app's own in development.
 */
export function isOpened(url: URL, rules: MapoAiLinkRules): boolean {
  return rules.allow.some((pattern) => {
    const isSamePort =
      pattern.port === undefined
        ? WEB_PORTS.has(url.port)
        : pattern.port === url.port;
    return isSamePort && isHostOf(pattern, url);
  });
}

/**
 * Whether the app leaves a hop of a fetch to itself: it opens the hop's
 * host (`allow`), and the hop is the link the operator gave, or a redirect
 * that stays on the same host, itself opened. A page never leads into a
 * host the app opens from another host: a redirect there is checked as any
 * address is.
 */
export function isHopOpened(
  url: URL,
  rules: MapoAiLinkRules,
  from?: { url: URL; isOpened: boolean },
): boolean {
  if (!isOpened(url, rules)) return false;
  if (!from) return true;
  const isSameHost = hostNameOf(from.url) === hostNameOf(url);
  return from.isOpened && isSameHost;
}

/** Whether a pattern names the host of an address. */
function isHostOf(pattern: HostPattern, url: URL): boolean {
  if (pattern.host === "*") return true;
  const host = hostNameOf(url);
  if (!pattern.subdomains) return host === pattern.host;
  return host.endsWith(`.${pattern.host}`);
}

/**
 * The host of an address as the patterns compare it: without the dots a
 * fully qualified name may end with, `example.org.` being `example.org`.
 */
function hostNameOf(url: URL): string {
  return url.hostname.replace(/\.+$/, "");
}

/** The port an address connects to: its own, or its scheme's. */
function portOf(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}

/**
 * What a page read from a link is named, as a file is: its host and its
 * path, without the query, which may hold a token, cut to 200 characters.
 * Its last segment gives the reader of its extension, as a file's name
 * does: `museo.example/eventi/notte.html`.
 */
export function pageNameOf(url: URL): string {
  let path = url.pathname;
  try {
    path = decodeURI(path);
  } catch {
    // A path written with broken escapes stays as it is.
  }
  const name = `${url.host}${path === "/" ? "" : path}`;
  return Array.from(name, (char) => (isControl(char) ? " " : char))
    .join("")
    .slice(0, 200);
}

function isControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 32 || code === 127;
}

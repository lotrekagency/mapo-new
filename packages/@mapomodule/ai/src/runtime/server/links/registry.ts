/**
 * The app's way of fetching the pages of links, when it registers one in
 * place of Mapo's.
 */

import type { MapoAiFetcher } from "./types";

let registered: MapoAiFetcher | undefined;

/**
 * Registers the app's way of fetching the pages of links, in a Nitro
 * plugin, in place of Mapo's: for the pages Mapo cannot fetch, such as
 * those a script writes (through a service that renders them), those
 * behind a sign-in of the app's own, or on a server that reaches the web
 * through a proxy. The gateway still refuses a link before it is fetched
 * (its scheme, a user or a password, its port, `mapo.ai.web.deny`), but
 * the addresses its host leads to are the fetcher's to check: it replaces
 * Mapo's guard of the network, and its redirects are its own.
 *
 * @example
 * // server/plugins/mapo-ai-fetcher.ts
 * export default defineNitroPlugin(() => {
 *   registerMapoAiFetcher({
 *     label: "Renderer",
 *     async fetch({ url, signal }) {
 *       const response = await fetch(`https://renderer.internal/?url=${encodeURIComponent(url)}`, { signal });
 *       if (!response.ok) return { status: "http-error", httpStatus: response.status };
 *       const bytes = new Uint8Array(await response.arrayBuffer());
 *       return { url, type: "text/html", bytes };
 *     },
 *   });
 * });
 * @throws TypeError when it has no `fetch()`; Error when one is registered already
 */
export function registerMapoAiFetcher(fetcher: MapoAiFetcher): void {
  if (typeof fetcher?.fetch !== "function") {
    throw new TypeError("A fetcher has a fetch()");
  }
  if (registered) throw new Error("A fetcher is registered already");
  const label = typeof fetcher.label === "string" ? fetcher.label : undefined;
  registered = {
    ...(label ? { label } : {}),
    fetch: (request) => fetcher.fetch(request),
  };
}

/** The fetcher the app registered; `undefined` when it uses Mapo's. */
export function registeredMapoAiFetcher(): MapoAiFetcher | undefined {
  return registered;
}

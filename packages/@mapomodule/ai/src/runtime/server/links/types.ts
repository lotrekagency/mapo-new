/**
 * The pages of links, as `read/link` fetches them: what a fetcher gets and
 * answers. Mapo's fetches on Node (`node.ts`); an app may put its own in
 * its place (`registerMapoAiFetcher()`).
 */

import type { MapoAiLinkBlock, MapoAiLinkFailure } from "../../shared/gateway";

/** A page to fetch, as a fetcher gets it. */
export interface MapoAiFetchRequest {
  /**
   * The page's address, which the gateway has checked already: `http:` or
   * `https:`, no user or password, a port of the web or one the app opens,
   * a host the app does not keep out.
   */
  readonly url: string;
  /** Bytes the page may have, `limits.maxFileBytes`: a larger one is `too-large`. */
  readonly maxBytes: number;
  /** Stops the fetch: its time is up (`mapo.ai.web.timeout`), or the operator went away. */
  readonly signal: AbortSignal;
  /** The operator's languages, as their browser asks for them (`accept-language`). */
  readonly languages?: string;
}

/** A page fetched. */
export interface MapoAiFetchedPage {
  /** The address it came from, after its redirects. */
  url: string;
  /** Its media type, as its server declared it: `text/html; charset=utf-8`; `""` for none. */
  type: string;
  /** Its content, unzipped. */
  bytes: Uint8Array;
}

/** What a fetcher answers: the page, or why there is none. */
export type MapoAiFetchResult =
  | MapoAiFetchedPage
  | { status: "blocked"; reason: MapoAiLinkBlock }
  | { status: "unreachable"; reason: MapoAiLinkFailure }
  | { status: "http-error"; httpStatus: number }
  | { status: "too-large" };

/** A way of fetching the pages of links: Mapo's, or the app's. */
export interface MapoAiFetcher {
  /** Its name for people, in the server's log. */
  label?: string;
  /**
   * Fetches a page: its bytes, unzipped, or why there are none. It throws
   * when it cannot say, and the gateway answers `unreachable`.
   */
  fetch(
    request: MapoAiFetchRequest,
  ): MapoAiFetchResult | Promise<MapoAiFetchResult>;
}

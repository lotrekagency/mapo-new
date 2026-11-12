/**
 * `read/link` wired to the app's Nitro server: whether the app reads links,
 * its rules and limits from the runtime config, each user's pages of the
 * last minute, the fetcher (the app's, or Mapo's on Node, imported when a
 * page is read), and `read`'s readers and hooks. The logic lives in
 * `link.ts`, `rules.ts` and `node.ts`, which the tests run without Nitro.
 */

import { createError, getRequestHeader } from "h3";
import type { H3Event } from "h3";
import type { MapoAiSession } from "../auth/nitro";
import { mapoAiReadDependencies } from "../readers/nitro";
import { createRateLimiter } from "../run/limiter";
import type { LimitOutcome } from "../run/limiter";
import { mapoAiRunOptions } from "../run/nitro";
import { linksAreOn } from "./link";
import type { LinkDependencies } from "./link";
import { linkRulesOf } from "./rules";
import type { MapoAiLinkRules } from "./rules";
import { registeredMapoAiFetcher } from "./registry";
import type { MapoAiFetcher } from "./types";

/** The pages each user read in the last minute, in this process. */
const limiter = createRateLimiter();
/** The languages a request may ask a page in: a header of a browser, on one line. */
const LANGUAGES = /^[\w\s,;=.*-]{1,200}$/;

/** What `read/link` needs from the server, for this request. */
export function mapoAiLinkDependencies(
  event: H3Event,
  session: MapoAiSession,
): LinkDependencies {
  const options = mapoAiRunOptions(event);
  const rules = linkRulesOf(options.web);
  const languages = getRequestHeader(event, "accept-language")?.trim() ?? "";
  return {
    isOn: linksAreOn(options),
    rules,
    timeout: options.web.timeout,
    maxBytes: options.limits.maxFileBytes,
    ...(LANGUAGES.test(languages) ? { languages } : {}),
    fetcher:
      registeredMapoAiFetcher() ?? mapoFetcher(rules, options.web.userAgent),
    read: mapoAiReadDependencies(event, session),
    count: () =>
      refuseOverLimit(
        limiter.take(session.user.id, options.limits.linksPerUserPerMinute),
      ),
  };
}

/** Whether `read/link` reads pages, as `status` says it. */
export function mapoAiLinksAreOn(event?: H3Event): boolean {
  return linksAreOn(mapoAiRunOptions(event));
}

/**
 * Mapo's fetcher: `node.ts`, imported with the first page, so a server
 * that reads none never loads Node's network, and one that cannot fails
 * then, with the reason in the log.
 */
function mapoFetcher(rules: MapoAiLinkRules, userAgent: string): MapoAiFetcher {
  return {
    label: "Mapo",
    async fetch(request) {
      const { fetchPage } = await import("./node");
      return fetchPage(request, { rules, userAgent });
    },
  };
}

function refuseOverLimit(outcome: LimitOutcome): void {
  if (outcome.allowed) return;
  throw createError({
    statusCode: 429,
    statusMessage: "Too many links read: try again in a minute",
    data: { retryAfter: outcome.retryAfter },
  });
}

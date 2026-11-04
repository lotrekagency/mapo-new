/**
 * The backend session behind a gateway request: the browser's cookie,
 * forwarded to `userInfoApi`, and a short memory of the answer, so a burst
 * of calls asks the backend once. Pure: `nitro.ts` passes in how to ask.
 */

import { toHex } from "../storage/sealed";
import { readBackendUser } from "./user";
import type { MapoAiUser } from "./user";

/** How long a user the backend returned stays known without asking again. */
export const SESSION_TTL_MS = 30_000;

/** Sessions remembered at most; past that, the oldest goes first. */
export const MAX_SESSIONS = 1000;

/** What `userInfoApi` answered: its status, and its body when it is JSON. */
export interface BackendAnswer {
  status: number;
  body: unknown;
}

/** Asks `userInfoApi` with the request's cookie. It may throw: the backend may be down. */
export type AskBackend = (cookie: string) => Promise<BackendAnswer>;

/** Who a request's session belongs to. */
export type SessionOutcome =
  | {
      status: "signed-in";
      user: MapoAiUser;
      /** The user as `userInfoApi` returned them. */
      payload: Readonly<Record<string, unknown>>;
    }
  | { status: "anonymous" }
  | {
      status: "unavailable";
      /** Why the backend could not say, for the server's log. */
      reason: string;
    };

/** The sessions a server remembers. */
export interface SessionCache {
  /**
   * The session of `cookie`. A user the backend returned in the last
   * {@link SESSION_TTL_MS} comes from memory, and requests that arrive
   * together with the same cookie share one call. Only a returned user is
   * remembered: a refusal or a failure asks again next time.
   * @param cookie the request's `cookie` header; without one there is no session
   */
  resolve(cookie: string | undefined, ask: AskBackend): Promise<SessionOutcome>;
}

/** Options of {@link createSessionCache}, for tests. */
export interface SessionCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

const ANONYMOUS: SessionOutcome = { status: "anonymous" };

/**
 * A memory of sessions, in this process only: each server keeps its own,
 * and nothing of it is ever written down. A session is known by a hash of
 * its cookie, never by the cookie itself.
 */
export function createSessionCache(
  options: SessionCacheOptions = {},
): SessionCache {
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const maxEntries = options.maxEntries ?? MAX_SESSIONS;
  const now = options.now ?? Date.now;
  const known = new Map<string, { outcome: SessionOutcome; expires: number }>();
  const asking = new Map<string, Promise<SessionOutcome>>();

  function remember(key: string, outcome: SessionOutcome): void {
    known.delete(key);
    known.set(key, { outcome, expires: now() + ttlMs });
    for (const oldest of known.keys()) {
      if (known.size <= maxEntries) break;
      known.delete(oldest);
    }
  }

  return {
    async resolve(cookie, ask) {
      const hasCookie = typeof cookie === "string" && cookie.trim() !== "";
      if (!hasCookie) return ANONYMOUS;
      const key = await fingerprint(cookie);
      const remembered = known.get(key);
      const isFresh = remembered !== undefined && remembered.expires > now();
      if (remembered && isFresh) return remembered.outcome;
      if (remembered) known.delete(key);

      const pending = asking.get(key);
      if (pending) return pending;
      const answer = askBackend(cookie, ask)
        .then((outcome) => {
          if (outcome.status === "signed-in") remember(key, outcome);
          return outcome;
        })
        .finally(() => asking.delete(key));
      asking.set(key, answer);
      return answer;
    },
  };
}

/**
 * What the backend's answer says about the session. A refusal (401, or 403
 * as DRF's session authentication answers an anonymous caller) means
 * nobody is signed in; any other failure means the backend could not say,
 * which never counts as signed out: the browser would be sent to the login
 * page for a backend that is only down.
 */
async function askBackend(
  cookie: string,
  ask: AskBackend,
): Promise<SessionOutcome> {
  let answer: BackendAnswer;
  try {
    answer = await ask(cookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "unavailable",
      reason: `userInfoApi cannot be reached (${message})`,
    };
  }
  const isRefused = answer.status === 401 || answer.status === 403;
  if (isRefused) return ANONYMOUS;
  const isSuccess = answer.status >= 200 && answer.status < 300;
  if (!isSuccess) {
    return {
      status: "unavailable",
      reason: `userInfoApi answered ${answer.status}`,
    };
  }
  const read = readBackendUser(answer.body);
  if (!read) {
    return {
      status: "unavailable",
      reason: "userInfoApi answered with no user: a JSON object with an id",
    };
  }
  return { status: "signed-in", ...read };
}

/** A SHA-256 of the cookie, in hexadecimal: the session's key in memory. */
async function fingerprint(cookie: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(cookie),
  );
  return toHex(new Uint8Array(digest));
}

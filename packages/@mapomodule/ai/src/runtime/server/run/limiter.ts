/**
 * How many calls to `run` a user may make in a minute: counted in the
 * memory of the server process, over the last sixty seconds. Nothing is
 * written per call; a restart forgets the counts, and each process of a
 * server with several counts for itself. Pure: the clock is passed in.
 */

/** The window the calls are counted over. */
export const LIMIT_WINDOW_MS = 60_000;

/** Users counted at most; past that, the one counted least recently goes first. */
export const MAX_COUNTED_USERS = 10_000;

/** A call let through, or refused with the seconds to wait. */
export type LimitOutcome =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

/** The counts of one server process. */
export interface RateLimiter {
  /**
   * Counts a call of `user`, unless they made `perMinute` already in the
   * last minute: then the call is refused, and not counted.
   */
  take(user: string, perMinute: number): LimitOutcome;
  /**
   * Whether a call of `user` would be let through now, without counting it:
   * for the checks that cost something before `take()`.
   */
  peek(user: string, perMinute: number): LimitOutcome;
}

/** Options of {@link createRateLimiter}, for tests. */
export interface RateLimiterOptions {
  now?: () => number;
  maxUsers?: number;
}

export function createRateLimiter(
  options: RateLimiterOptions = {},
): RateLimiter {
  const now = options.now ?? Date.now;
  const maxUsers = options.maxUsers ?? MAX_COUNTED_USERS;
  /** When each user's calls of the last minute were made, oldest first. */
  const calls = new Map<string, number[]>();

  /** The calls of `user` in the last minute, or the wait when they are too many. */
  function check(
    user: string,
    perMinute: number,
    at: number,
  ): { recent: number[]; refused?: LimitOutcome } {
    const since = at - LIMIT_WINDOW_MS;
    const recent = (calls.get(user) ?? []).filter((time) => time > since);
    if (recent.length < perMinute) return { recent };
    const oldest = recent[0] ?? at;
    const wait = Math.ceil((oldest + LIMIT_WINDOW_MS - at) / 1000);
    return {
      recent,
      refused: { allowed: false, retryAfter: Math.max(1, wait) },
    };
  }

  return {
    peek(user, perMinute) {
      return check(user, perMinute, now()).refused ?? { allowed: true };
    },

    take(user, perMinute) {
      const at = now();
      const { recent, refused } = check(user, perMinute, at);
      if (refused) {
        if (calls.has(user)) calls.set(user, recent);
        return refused;
      }
      recent.push(at);
      // Counted again: the user moves to the end, the most recent.
      calls.delete(user);
      calls.set(user, recent);
      for (const oldest of calls.keys()) {
        if (calls.size <= maxUsers) break;
        calls.delete(oldest);
      }
      return { allowed: true };
    },
  };
}

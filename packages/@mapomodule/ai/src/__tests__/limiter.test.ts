import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../runtime/server/run/limiter";

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("lets a user make the calls of a minute, then refuses the next one", () => {
    const time = clock();
    const limiter = createRateLimiter({ now: time.now });

    expect(limiter.take("u1", 2)).toEqual({ allowed: true });
    expect(limiter.take("u1", 2)).toEqual({ allowed: true });
    expect(limiter.take("u1", 2)).toEqual({ allowed: false, retryAfter: 60 });
  });

  it("says when the oldest call of the minute leaves it", () => {
    const time = clock();
    const limiter = createRateLimiter({ now: time.now });
    limiter.take("u1", 2);
    time.advance(20_000);
    limiter.take("u1", 2);
    time.advance(15_000);

    expect(limiter.take("u1", 2)).toEqual({ allowed: false, retryAfter: 25 });
  });

  it("counts over the last sixty seconds, not over a clock minute", () => {
    const time = clock();
    const limiter = createRateLimiter({ now: time.now });
    limiter.take("u1", 1);
    time.advance(59_999);
    expect(limiter.take("u1", 1).allowed).toBe(false);
    time.advance(1);

    expect(limiter.take("u1", 1).allowed).toBe(true);
  });

  it("does not count a refused call", () => {
    const time = clock();
    const limiter = createRateLimiter({ now: time.now });
    limiter.take("u1", 1);
    time.advance(30_000);
    limiter.take("u1", 1);
    time.advance(30_000);

    expect(limiter.take("u1", 1).allowed).toBe(true);
  });

  it("tells without counting whether a call would get through", () => {
    const limiter = createRateLimiter({ now: clock().now });

    expect(limiter.peek("u1", 1)).toEqual({ allowed: true });
    expect(limiter.peek("u1", 1)).toEqual({ allowed: true });
    limiter.take("u1", 1);
    expect(limiter.peek("u1", 1)).toEqual({ allowed: false, retryAfter: 60 });
  });

  it("refuses every call with a limit of 0", () => {
    const limiter = createRateLimiter({ now: clock().now });

    expect(limiter.peek("u1", 0).allowed).toBe(false);
    expect(limiter.take("u1", 0).allowed).toBe(false);
  });

  it("counts each user apart", () => {
    const limiter = createRateLimiter({ now: clock().now });
    limiter.take("u1", 1);

    expect(limiter.take("u2", 1).allowed).toBe(true);
  });

  it("forgets the user counted least recently past the most it keeps", () => {
    const time = clock();
    const limiter = createRateLimiter({ now: time.now, maxUsers: 2 });
    limiter.take("u1", 1);
    limiter.take("u2", 1);
    limiter.take("u3", 1);

    expect(limiter.take("u1", 1).allowed).toBe(true);
    expect(limiter.take("u3", 1).allowed).toBe(false);
  });

  it("follows a limit that changes from one call to the next", () => {
    const limiter = createRateLimiter({ now: clock().now });
    limiter.take("u1", 1);

    expect(limiter.take("u1", 1).allowed).toBe(false);
    expect(limiter.take("u1", 3).allowed).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  SESSION_TTL_MS,
  createSessionCache,
} from "../runtime/server/auth/session";
import type { BackendAnswer } from "../runtime/server/auth/session";

const EDITOR = { id: 2, username: "editor", all_permissions: ["view_article"] };

/** A backend that answers every cookie the same way, and counts the calls. */
function backend(answer: BackendAnswer | Error) {
  return vi.fn(async (_cookie: string): Promise<BackendAnswer> => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

/** A clock the test moves by hand. */
function clock(start = 1_000_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("the session cache", () => {
  it.each([undefined, "", "   "])(
    "finds nobody signed in with the cookie %j, without asking the backend",
    async (cookie) => {
      const ask = backend({ status: 200, body: EDITOR });

      const outcome = await createSessionCache().resolve(cookie, ask);

      expect(outcome).toEqual({ status: "anonymous" });
      expect(ask).not.toHaveBeenCalled();
    },
  );

  it("asks the backend with the request's cookie, as it came", async () => {
    const ask = backend({ status: 200, body: EDITOR });
    const cookie = "sessionid=abc; csrftoken=xyz";

    const outcome = await createSessionCache().resolve(cookie, ask);

    expect(ask).toHaveBeenCalledWith(cookie);
    expect(outcome.status).toBe("signed-in");
    if (outcome.status !== "signed-in") return;
    expect(outcome.user.username).toBe("editor");
    expect(outcome.payload).toEqual(EDITOR);
  });

  it("remembers a user for 30 seconds, then asks again", async () => {
    const time = clock();
    const cache = createSessionCache({ now: time.now });
    const ask = backend({ status: 200, body: EDITOR });

    await cache.resolve("sessionid=abc", ask);
    time.advance(SESSION_TTL_MS - 1);
    await cache.resolve("sessionid=abc", ask);
    expect(ask).toHaveBeenCalledTimes(1);

    time.advance(1);
    await cache.resolve("sessionid=abc", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("remembers each cookie apart", async () => {
    const cache = createSessionCache();
    const ask = backend({ status: 200, body: EDITOR });

    await cache.resolve("sessionid=abc", ask);
    await cache.resolve("sessionid=def", ask);

    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("shares one call between requests that arrive together", async () => {
    const cache = createSessionCache();
    let release: (answer: BackendAnswer) => void = () => {};
    const ask = vi.fn(
      () =>
        new Promise<BackendAnswer>((resolve) => {
          release = resolve;
        }),
    );

    const first = cache.resolve("sessionid=abc", ask);
    const second = cache.resolve("sessionid=abc", ask);
    await vi.waitFor(() => expect(ask).toHaveBeenCalled());
    release({ status: 200, body: EDITOR });

    expect((await first).status).toBe("signed-in");
    expect((await second).status).toBe("signed-in");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("never hands one cookie's user to another, whatever order the backend answers in", async () => {
    const cache = createSessionCache();
    const pending = new Map<string, (answer: BackendAnswer) => void>();
    const ask = vi.fn(
      (cookie: string) =>
        new Promise<BackendAnswer>((resolve) => {
          pending.set(cookie, resolve);
        }),
    );

    const first = cache.resolve("sessionid=alice", ask);
    const second = cache.resolve("sessionid=bob", ask);
    await vi.waitFor(() => expect(pending.size).toBe(2));
    pending.get("sessionid=bob")?.({ status: 200, body: { id: "bob" } });
    pending.get("sessionid=alice")?.({ status: 200, body: { id: "alice" } });

    const [alice, bob] = await Promise.all([first, second]);
    expect(alice.status === "signed-in" && alice.user.id).toBe("alice");
    expect(bob.status === "signed-in" && bob.user.id).toBe("bob");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])(
    "finds nobody signed in when the backend answers %i, and asks again next time",
    async (status) => {
      const cache = createSessionCache();
      const ask = backend({ status, body: { detail: "Not authenticated" } });

      expect(await cache.resolve("sessionid=old", ask)).toEqual({
        status: "anonymous",
      });
      await cache.resolve("sessionid=old", ask);
      expect(ask).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ["a server error", { status: 500, body: undefined }, "answered 500"],
    ["a wrong address", { status: 404, body: undefined }, "answered 404"],
    ["a redirect", { status: 302, body: undefined }, "answered 302"],
    ["a page that is not JSON", { status: 200, body: undefined }, "no user"],
    [
      "an object without an id",
      { status: 200, body: { detail: "ok" } },
      "no user",
    ],
  ])(
    "cannot tell who is signed in on %s, and never takes it for signed out",
    async (_case, answer, reason) => {
      const cache = createSessionCache();
      const ask = backend(answer);

      const outcome = await cache.resolve("sessionid=abc", ask);

      expect(outcome.status).toBe("unavailable");
      if (outcome.status === "unavailable") {
        expect(outcome.reason).toContain(reason);
      }
      await cache.resolve("sessionid=abc", ask);
      expect(ask).toHaveBeenCalledTimes(2);
    },
  );

  it("cannot tell who is signed in when the backend cannot be reached", async () => {
    const ask = backend(new Error("connect ECONNREFUSED 127.0.0.1:8000"));

    const outcome = await createSessionCache().resolve("sessionid=abc", ask);

    expect(outcome).toEqual({
      status: "unavailable",
      reason:
        "userInfoApi cannot be reached (connect ECONNREFUSED 127.0.0.1:8000)",
    });
  });

  it("forgets the oldest session past its limit", async () => {
    const cache = createSessionCache({ maxEntries: 2 });
    const ask = backend({ status: 200, body: EDITOR });

    await cache.resolve("sessionid=1", ask);
    await cache.resolve("sessionid=2", ask);
    await cache.resolve("sessionid=3", ask);
    expect(ask).toHaveBeenCalledTimes(3);

    await cache.resolve("sessionid=3", ask);
    await cache.resolve("sessionid=2", ask);
    expect(ask).toHaveBeenCalledTimes(3);
    await cache.resolve("sessionid=1", ask);
    expect(ask).toHaveBeenCalledTimes(4);
  });
});

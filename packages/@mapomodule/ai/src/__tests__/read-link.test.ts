import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, createRouter, toWebHandler } from "h3";
import type { MapoAiFetcher } from "../runtime/server/links/types";
import type { MapoAiReadContext } from "../runtime/server/readers/types";
import { MAPO_AI_GATEWAY_PATH } from "../runtime/shared/gateway";

const linkPath = `${MAPO_AI_GATEWAY_PATH}/read/link`;

/** The users of the fake backend, by the value of their session cookie. */
const USERS: Record<string, Record<string, unknown>> = {
  editor: { id: 2, username: "editor", is_superuser: false, groups: [] },
};

type Hook = (...args: unknown[]) => unknown;

/** What the mocked `nitropack/runtime` serves: the config, the hooks, the backend. */
const runtime = vi.hoisted(() => {
  const state: {
    config: Record<string, unknown>;
    hooks: Map<string, Hook[]>;
  } = { config: {}, hooks: new Map() };
  return state;
});

vi.mock("nitropack/runtime", () => ({
  useRuntimeConfig: () => runtime.config,
  useStorage: () => {
    throw new Error("read/link keeps nothing");
  },
  useNitroApp: () => ({
    localFetch: (_url: string, init?: RequestInit) => fakeBackend(init),
    hooks: {
      callHook: async (name: string, ...args: unknown[]) => {
        for (const hook of runtime.hooks.get(name) ?? []) await hook(...args);
      },
    },
  }),
}));

/** The backend's `userInfoApi`: the user of the session cookie, or 403 as DRF answers. */
function fakeBackend(init?: RequestInit): Response {
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  const session = /(?:^|;\s*)sessionid=([^;]+)/.exec(cookie)?.[1];
  const user = session ? USERS[session] : undefined;
  return user
    ? Response.json(user)
    : Response.json({ detail: "Not signed in" }, { status: 403 });
}

/** The route on a bare h3 app, as Nitro mounts it. Fresh modules each time. */
async function gateway(): Promise<(request: Request) => Promise<Response>> {
  const route = (await import("../runtime/server/routes/read-link.post"))
    .default;
  return toWebHandler(createApp().use(createRouter().post(linkPath, route)));
}

async function registerFetcher(fetcher: MapoAiFetcher): Promise<void> {
  const { registerMapoAiFetcher } =
    await import("../runtime/server/links/registry");
  registerMapoAiFetcher(fetcher);
}

function linkRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${linkPath}`, {
    method: "POST",
    headers: {
      cookie: "sessionid=editor",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const response = await (await gateway())(linkRequest(body, headers));
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

const PAGE = new TextEncoder().encode(
  "<html><head><title>Notte</title></head><body><main><p>Sabato 16 gennaio 2027.</p></main></body></html>",
);

beforeEach(() => {
  vi.resetModules();
  runtime.config = {
    app: { baseURL: "/" },
    public: { mapoCore: { userInfoApi: "/api/profiles/me/" } },
    mapoAi: { admin: {} },
  };
  runtime.hooks = new Map();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /_mapo/ai/read/link", () => {
  it("answers only a signed-in user of the app's own pages", async () => {
    const anonymous = await post(
      { url: "https://museo.example/" },
      { cookie: "" },
    );
    const crossSite = await post(
      { url: "https://museo.example/" },
      { "sec-fetch-site": "cross-site" },
    );

    expect(anonymous.status).toBe(401);
    expect(crossSite.status).toBe(403);
  });

  it("takes a link as JSON, and nothing else", async () => {
    const form = await (
      await gateway()
    )(
      new Request(`http://localhost${linkPath}`, {
        method: "POST",
        headers: { cookie: "sessionid=editor", "content-type": "text/plain" },
        body: "https://museo.example/",
      }),
    );

    expect(form.status).toBe(415);
    expect((await post({ link: "https://museo.example/" })).status).toBe(400);
    expect((await post({ url: "" })).status).toBe(400);
    expect(
      (await post({ url: `https://a.example/${"x".repeat(2048)}` })).status,
    ).toBe(400);
  });

  it("reads the page an app's fetcher gives, with the reader of its format, and the hooks see its address", async () => {
    const seen: MapoAiReadContext["file"][] = [];
    runtime.hooks.set("mapo-ai:read", [
      (context: unknown) => {
        seen.push((context as MapoAiReadContext).file);
      },
    ]);
    await registerFetcher({
      fetch: async ({ url }) => ({
        url: `${url}?final`,
        type: "text/html",
        bytes: PAGE,
      }),
    });

    const answer = await post(
      { url: "https://museo.example/eventi/notte" },
      { "accept-language": "it-IT,it;q=0.9" },
    );

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.body).toEqual({
      status: "read",
      reader: "html",
      url: "https://museo.example/eventi/notte?final",
      parts: [
        {
          kind: "text",
          name: "museo.example/eventi/notte",
          text: "Page title: Notte\nPage URL: https://museo.example/eventi/notte?final\n\nSabato 16 gennaio 2027.",
        },
      ],
    });
    expect(seen).toEqual([
      {
        name: "museo.example/eventi/notte",
        type: "text/html",
        size: PAGE.byteLength,
        url: "https://museo.example/eventi/notte?final",
      },
    ]);
  });

  it("refuses an address of the server itself before any connection, with Mapo's fetcher", async () => {
    expect((await post({ url: "http://127.0.0.1/admin" })).body).toEqual({
      status: "blocked",
      reason: "address",
    });
    expect((await post({ url: "http://localhost:3000/" })).body).toEqual({
      status: "blocked",
      reason: "port",
    });
  });

  it("answers off when the app turns links off, or keeps every host out", async () => {
    runtime.config.mapoAi = { admin: {}, readers: { link: false } };
    expect((await post({ url: "https://museo.example/" })).body).toEqual({
      status: "off",
    });

    runtime.config.mapoAi = { admin: {}, web: { deny: ["*"] } };
    expect((await post({ url: "https://museo.example/" })).body).toEqual({
      status: "off",
    });
  });

  it("counts the pages of each user, and says when to try again past the limit", async () => {
    runtime.config.mapoAi = { admin: {}, limits: { linksPerUserPerMinute: 1 } };
    await registerFetcher({
      fetch: async ({ url }) => ({ url, type: "text/html", bytes: PAGE }),
    });
    const handle = await gateway();

    const first = await handle(linkRequest({ url: "https://museo.example/a" }));
    const blocked = await handle(linkRequest({ url: "ftp://museo.example/" }));
    const second = await handle(
      linkRequest({ url: "https://museo.example/b" }),
    );

    expect(first.status).toBe(200);
    expect(await blocked.json()).toEqual({
      status: "blocked",
      reason: "scheme",
    });
    expect(second.status).toBe(429);
    expect(Number(second.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, createRouter, defineEventHandler, toWebHandler } from "h3";
import { createStorage } from "unstorage";
import type { Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import type { MapoAiUserContext } from "../runtime/server/auth/user";
import { DEFAULT_LIMITS } from "../runtime/server/run/options";
import {
  MAPO_AI_CONTRACT_VERSION,
  MAPO_AI_GATEWAY_PATH,
} from "../runtime/shared/gateway";

const SECRET = "status-test-secret-0123456789-abcdefghijk";
const statusPath = `${MAPO_AI_GATEWAY_PATH}/status`;
const actionPath = `${MAPO_AI_GATEWAY_PATH}/action`;
const adminPath = `${MAPO_AI_GATEWAY_PATH}/admin-only`;

/** The users of the fake backend, by the value of their session cookie. */
const USERS: Record<string, Record<string, unknown>> = {
  admin: {
    id: 1,
    username: "admin",
    is_superuser: true,
    all_permissions: ["view_article", "add_article", "change_article"],
    groups: ["admin"],
  },
  editor: {
    id: 2,
    username: "editor",
    is_superuser: false,
    all_permissions: ["view_article", "add_article", "change_article"],
    groups: ["editors"],
    is_internal: true,
  },
  outsider: {
    id: 9,
    username: "outsider",
    is_superuser: false,
    all_permissions: [],
    groups: ["editors"],
    is_internal: false,
  },
};

type Hook = (context: MapoAiUserContext) => void | Promise<void>;

/** What the mocked `nitropack/runtime` serves: the config, the storage, the hooks, the backend. */
const runtime = vi.hoisted(() => {
  const state: {
    config: Record<string, unknown>;
    root: Storage | undefined;
    hooks: Map<string, Array<(...args: unknown[]) => unknown>>;
    localFetch: (url: string, init?: RequestInit) => Promise<Response>;
  } = {
    config: {},
    root: undefined,
    hooks: new Map(),
    localFetch: async () => new Response(null, { status: 500 }),
  };
  return state;
});

vi.mock("nitropack/runtime", async () => {
  const { prefixStorage } = await import("unstorage");
  const root = (): Storage => {
    if (!runtime.root) throw new Error("No root storage in this test");
    return runtime.root;
  };
  return {
    useRuntimeConfig: () => runtime.config,
    useStorage: (base = "") => (base ? prefixStorage(root(), base) : root()),
    useNitroApp: () => ({
      localFetch: (url: string, init?: RequestInit) =>
        runtime.localFetch(url, init),
      hooks: {
        callHook: async (name: string, ...args: unknown[]) => {
          for (const hook of runtime.hooks.get(name) ?? []) await hook(...args);
        },
      },
    }),
  };
});

/** The backend's `userInfoApi`: the user of the session cookie, or 403 as DRF answers. */
const fakeBackend = vi.fn(async (_url: string, init?: RequestInit) => {
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  const session = /(?:^|;\s*)sessionid=([^;]+)/.exec(cookie)?.[1];
  const user = session ? USERS[session] : undefined;
  if (!user) {
    return Response.json(
      { detail: "Authentication credentials were not provided." },
      { status: 403 },
    );
  }
  return Response.json(user);
});

function onUser(hook: Hook): void {
  const hooks = runtime.hooks.get("mapo-ai:user") ?? [];
  hooks.push(hook as (...args: unknown[]) => unknown);
  runtime.hooks.set("mapo-ai:user", hooks);
}

/**
 * The status route mounted on a bare h3 app, as Nitro mounts it, beside a
 * route that acts (and changes something, for the cross-site check) and an
 * admin route. Fresh modules each time, so no session is remembered from
 * another test.
 */
async function gateway(): Promise<(request: Request) => Promise<Response>> {
  const status = (await import("../runtime/server/routes/status.get")).default;
  const { requireMapoAiAdmin, requireMapoAiSession } =
    await import("../runtime/server/auth/nitro");
  const action = defineEventHandler(async (event) => {
    const session = await requireMapoAiSession(event);
    return { user: session.user.id };
  });
  const adminOnly = defineEventHandler(async (event) => {
    const session = await requireMapoAiAdmin(event);
    return { admin: session.user.id };
  });
  const router = createRouter()
    .get(statusPath, status)
    .post(actionPath, action)
    .get(adminPath, adminOnly);
  return toWebHandler(createApp().use(router));
}

function actionRequest(init: RequestInit = {}): Request {
  return new Request(`http://localhost${actionPath}`, {
    method: "POST",
    ...init,
  });
}

function adminRequest(init?: RequestInit): Request {
  return new Request(`http://localhost${adminPath}`, init);
}

function asUser(session: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { cookie: `sessionid=${session}; theme=dark`, ...init.headers },
  };
}

function statusRequest(init?: RequestInit): Request {
  return new Request(`http://localhost${statusPath}`, init);
}

beforeEach(() => {
  vi.resetModules();
  const root = createStorage();
  root.mount("mapo-ai", memoryDriver());
  runtime.root = root;
  runtime.config = {
    app: { baseURL: "/" },
    public: { mapoCore: { userInfoApi: "/api/profiles/me/" } },
    mapoAi: { secret: SECRET, admin: {} },
  };
  runtime.hooks = new Map();
  fakeBackend.mockClear();
  runtime.localFetch = fakeBackend;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /_mapo/ai/status", () => {
  it("answers 401 without a session cookie, and asks the backend nothing", async () => {
    const response = await (await gateway())(statusRequest());

    expect(response.status).toBe(401);
    expect(fakeBackend).not.toHaveBeenCalled();
  });

  it("answers 401 to a cookie the backend refuses", async () => {
    const response = await (await gateway())(statusRequest(asUser("expired")));

    expect(response.status).toBe(401);
    expect(fakeBackend).toHaveBeenCalledOnce();
  });

  it("tells a signed-in user what the gateway offers them, and nothing about the storage", async () => {
    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contract: MAPO_AI_CONTRACT_VERSION,
      allowed: true,
      admin: false,
      providers: [],
      limits: DEFAULT_LIMITS,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("lists the providers the app enables, with their models and the defaults", async () => {
    runtime.config.mapoAi = {
      secret: SECRET,
      admin: {},
      providers: { mock: { models: ["mock", "mock-large"], timeout: 30 } },
      default: { provider: "mock", models: { extract: "mock-large" } },
      limits: { perUserPerMinute: 5 },
    };

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(await response.json()).toEqual({
      contract: MAPO_AI_CONTRACT_VERSION,
      allowed: true,
      admin: false,
      providers: [
        { id: "mock", label: "Mock", models: ["mock", "mock-large"] },
      ],
      default: {
        provider: "mock",
        models: { fill: "mock", extract: "mock-large" },
      },
      limits: { ...DEFAULT_LIMITS, perUserPerMinute: 5 },
    });
  });

  it("lists no provider the app enables that does not exist", async () => {
    runtime.config.mapoAi = {
      secret: SECRET,
      admin: {},
      providers: { acme: { models: ["a"] } },
    };

    const response = await (await gateway())(statusRequest(asUser("editor")));

    const body: unknown = await response.json();
    expect(body).toMatchObject({ providers: [] });
    expect(body).not.toHaveProperty("default");
  });

  it("shows the AI's admins the state of the storage, never the secret", async () => {
    const response = await (await gateway())(statusRequest(asUser("admin")));

    const body: unknown = await response.json();
    expect(body).toEqual({
      contract: MAPO_AI_CONTRACT_VERSION,
      allowed: true,
      admin: true,
      storage: { open: true, secret: "set", mounted: true, driver: "memory" },
      providers: [],
      limits: DEFAULT_LIMITS,
    });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("says why the storage is closed, to an admin", async () => {
    runtime.config.mapoAi = { secret: "short", admin: {} };
    runtime.root = createStorage();

    const response = await (await gateway())(statusRequest(asUser("admin")));

    expect(await response.json()).toMatchObject({
      storage: { open: false, secret: "too-short", mounted: false },
    });
  });

  it("makes admins of the groups in mapo.ai.admin", async () => {
    runtime.config.mapoAi = { secret: SECRET, admin: { groups: ["editors"] } };

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(await response.json()).toMatchObject({
      admin: true,
      storage: { open: true },
    });
  });

  it("asks userInfoApi under the app's base URL, with the cookie and nothing else", async () => {
    runtime.config = {
      ...runtime.config,
      app: { baseURL: "/backoffice/" },
      public: { mapoCore: { userInfoApi: "/api/admin/me/" } },
    };

    await (
      await gateway()
    )(
      statusRequest(
        asUser("editor", {
          headers: {
            authorization: "Bearer someone-else",
            "x-forwarded-for": "10.0.0.1",
          },
        }),
      ),
    );

    expect(fakeBackend).toHaveBeenCalledOnce();
    const [url, init] = fakeBackend.mock.calls[0] ?? [];
    expect(url).toBe("/backoffice/api/admin/me/");
    const sent: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      sent[name] = value;
    });
    expect(sent).toEqual({
      cookie: "sessionid=editor; theme=dark",
      accept: "application/json",
    });
  });

  it("falls back to core's default userInfoApi", async () => {
    runtime.config = { mapoAi: { secret: SECRET } };

    await (
      await gateway()
    )(statusRequest(asUser("editor")));

    expect(fakeBackend.mock.calls[0]?.[0]).toBe("/api/profiles/me/");
  });

  it("refuses a userInfoApi among the gateway's own routes, which would call itself without end", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.config = {
      ...runtime.config,
      app: { baseURL: "/backoffice/" },
      public: { mapoCore: { userInfoApi: "/_mapo/ai/status" } },
    };

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(response.status).toBe(502);
    expect(fakeBackend).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain(
      "/backoffice/_mapo/ai/status",
    );
  });

  it("asks the backend once for a burst of requests with the same session", async () => {
    const handle = await gateway();

    for (let i = 0; i < 3; i++) await handle(statusRequest(asUser("editor")));

    expect(fakeBackend).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "the backend cannot be reached",
      async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
      },
    ],
    ["the backend fails", async () => new Response("oops", { status: 500 })],
    [
      "userInfoApi answers a page",
      async () => new Response("<html>login</html>", { status: 200 }),
    ],
  ])("answers 502, never 401, when %s", async (_case, backend) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.localFetch = backend;

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(response.status).toBe(502);
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toContain("userInfoApi");
    expect(String(error.mock.calls[0]?.[0])).not.toContain("sessionid");
  });
});

describe("who may use the AI", () => {
  it("tells a user mapo.ai.users does not pick, in status, and refuses them with 403 where the gateway acts", async () => {
    runtime.config.mapoAi = {
      secret: SECRET,
      admin: {},
      users: { groups: ["writers"] },
    };
    const handle = await gateway();

    const refused = await handle(statusRequest(asUser("editor")));
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({
      contract: MAPO_AI_CONTRACT_VERSION,
      allowed: false,
      admin: false,
    });
    expect((await handle(actionRequest(asUser("editor")))).status).toBe(403);
    expect(
      await (await handle(statusRequest(asUser("admin")))).json(),
    ).toMatchObject({
      allowed: true,
    });
  });

  it("lets the AI's admins in whatever mapo.ai.users says", async () => {
    runtime.config.mapoAi = {
      secret: SECRET,
      admin: { groups: ["editors"] },
      users: { groups: ["writers"] },
    };
    const handle = await gateway();

    expect(
      await (await handle(statusRequest(asUser("editor")))).json(),
    ).toMatchObject({
      allowed: true,
      admin: true,
    });
    expect((await handle(actionRequest(asUser("editor")))).status).toBe(200);
  });

  it("grants nothing with a rule it cannot read, and says so once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.config.mapoAi = { secret: SECRET, admin: {}, users: "editors" };
    const handle = await gateway();

    expect(
      await (await handle(statusRequest(asUser("editor")))).json(),
    ).toMatchObject({
      allowed: false,
    });
    expect((await handle(actionRequest(asUser("editor")))).status).toBe(403);
    expect(
      await (await handle(statusRequest(asUser("admin")))).json(),
    ).toMatchObject({
      allowed: true,
    });
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toContain("mapo.ai.users");
  });

  it("makes no admin of anyone but superusers with an admin rule it cannot read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.config.mapoAi = { secret: SECRET, admin: ["editors"] };

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(await response.json()).toMatchObject({
      allowed: true,
      admin: false,
    });
  });

  it("lets a mapo-ai:user hook refuse a user the backend does not mark as internal", async () => {
    onUser((context) => {
      if (context.payload.is_internal !== true) context.allowed = false;
    });
    const handle = await gateway();

    expect(
      await (await handle(statusRequest(asUser("outsider")))).json(),
    ).toMatchObject({
      allowed: false,
    });
    expect((await handle(actionRequest(asUser("outsider")))).status).toBe(403);
    expect(
      await (await handle(statusRequest(asUser("editor")))).json(),
    ).toMatchObject({
      allowed: true,
    });
    expect((await handle(actionRequest(asUser("editor")))).status).toBe(200);
  });

  it("keeps a hook's refusal, whatever a later hook sets", async () => {
    onUser((context) => {
      if (context.payload.is_internal !== true) context.allowed = false;
    });
    onUser((context) => {
      context.allowed = context.user.groups.includes("editors");
    });
    const handle = await gateway();

    expect(
      await (await handle(statusRequest(asUser("outsider")))).json(),
    ).toMatchObject({
      allowed: false,
    });
    expect((await handle(actionRequest(asUser("outsider")))).status).toBe(403);
    expect((await handle(actionRequest(asUser("editor")))).status).toBe(200);
  });

  it("takes only false as a refusal, and anything but true as one too", async () => {
    const seen: boolean[] = [];
    onUser((context) => {
      (context as { allowed: unknown }).allowed = "yes";
      seen.push(context.allowed);
    });

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(seen).toEqual([false]);
    expect(await response.json()).toMatchObject({ allowed: false });
  });

  it("makes no admin of a superuser a hook refuses, and shows them no storage", async () => {
    onUser((context) => {
      if (context.user.superuser) context.allowed = false;
    });
    const handle = await gateway();

    expect(await (await handle(statusRequest(asUser("admin")))).json()).toEqual(
      {
        contract: MAPO_AI_CONTRACT_VERSION,
        allowed: false,
        admin: false,
      },
    );
    expect((await handle(adminRequest(asUser("admin")))).status).toBe(403);
  });

  it("fails the request when a hook throws, and lets nobody in", async () => {
    onUser(() => {
      throw new Error("the app's rule failed");
    });

    const response = await (await gateway())(statusRequest(asUser("editor")));

    expect(response.status).toBe(500);
  });

  it("gives the hook the request, the user, the payload and whether they are an admin", async () => {
    const seen: MapoAiUserContext[] = [];
    onUser((context) => {
      seen.push(context);
    });

    await (
      await gateway()
    )(statusRequest(asUser("editor")));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.user.username).toBe("editor");
    expect(seen[0]?.payload.is_internal).toBe(true);
    expect(seen[0]?.admin).toBe(false);
    expect(seen[0]?.allowed).toBe(true);
    expect(seen[0]?.event.path).toBe(statusPath);
  });

  it("calls the hook on every request, remembered sessions too", async () => {
    let calls = 0;
    onUser(() => {
      calls++;
    });
    const handle = await gateway();

    await handle(statusRequest(asUser("editor")));
    await handle(statusRequest(asUser("editor")));

    expect(calls).toBe(2);
    expect(fakeBackend).toHaveBeenCalledOnce();
  });

  it("never runs the hook for a user mapo.ai.users refuses", async () => {
    runtime.config.mapoAi = {
      secret: SECRET,
      admin: {},
      users: { groups: ["writers"] },
    };
    const hook = vi.fn();
    onUser(hook);

    await (
      await gateway()
    )(statusRequest(asUser("editor")));

    expect(hook).not.toHaveBeenCalled();
  });

  it("keeps a hook from changing the user the next request reads", async () => {
    onUser((context) => {
      try {
        (context.user.groups as string[]).push("admin");
      } catch {
        // frozen
      }
    });
    runtime.config.mapoAi = { secret: SECRET, admin: { groups: ["admin"] } };
    const handle = await gateway();

    await handle(statusRequest(asUser("editor")));
    const second = await handle(statusRequest(asUser("editor")));

    expect(await second.json()).toMatchObject({ admin: false });
  });
});

describe("admin routes", () => {
  it("answer 401 without a session", async () => {
    expect((await (await gateway())(adminRequest())).status).toBe(401);
  });

  it("refuse with 403 a user who does not administer the AI", async () => {
    expect(
      (await (await gateway())(adminRequest(asUser("editor")))).status,
    ).toBe(403);
  });

  it("let a superuser in", async () => {
    const response = await (await gateway())(adminRequest(asUser("admin")));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ admin: "1" });
  });

  it("let in a user mapo.ai.admin picks", async () => {
    runtime.config.mapoAi = { secret: SECRET, admin: { groups: ["editors"] } };

    const response = await (await gateway())(adminRequest(asUser("editor")));

    expect(response.status).toBe(200);
  });
});

describe("requests that change something", () => {
  it.each(["cross-site", "same-site", "none"])(
    "refuses with 403 a request a browser marks %s, before asking the backend",
    async (site) => {
      const response = await (
        await gateway()
      )(
        actionRequest(
          asUser("editor", { headers: { "sec-fetch-site": site } }),
        ),
      );

      expect(response.status).toBe(403);
      expect(fakeBackend).not.toHaveBeenCalled();
    },
  );

  it("lets through a request from the app's own pages", async () => {
    const response = await (
      await gateway()
    )(
      actionRequest(
        asUser("editor", { headers: { "sec-fetch-site": "same-origin" } }),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: "2" });
  });

  it("lets through a client that marks nothing, such as a server or an old browser", async () => {
    const response = await (await gateway())(actionRequest(asUser("editor")));

    expect(response.status).toBe(200);
  });

  it("still asks for a session after the check", async () => {
    const response = await (
      await gateway()
    )(actionRequest({ headers: { "sec-fetch-site": "same-origin" } }));

    expect(response.status).toBe(401);
  });
});

describe("requireModelPermission", () => {
  async function sessionOf(name: string) {
    const { readBackendUser } = await import("../runtime/server/auth/user");
    const read = readBackendUser(USERS[name]);
    if (!read) throw new Error(`No user ${name}`);
    return { user: read.user, admin: false };
  }

  async function statusCodeOf(run: () => void): Promise<number | undefined> {
    const { isError } = await import("h3");
    try {
      run();
      return undefined;
    } catch (error) {
      return isError(error) ? error.statusCode : -1;
    }
  }

  it("refuses with 403 a model the user may not fill, and passes one they may", async () => {
    const { requireModelPermission } =
      await import("../runtime/server/auth/nitro");
    const outsider = await sessionOf("outsider");
    const editor = await sessionOf("editor");

    expect(
      await statusCodeOf(() =>
        requireModelPermission(outsider, "article", "add"),
      ),
    ).toBe(403);
    expect(
      await statusCodeOf(() =>
        requireModelPermission(editor, "article", "change"),
      ),
    ).toBeUndefined();
  });

  it("checks nothing when the request names no model", async () => {
    const { requireModelPermission } =
      await import("../runtime/server/auth/nitro");
    const outsider = await sessionOf("outsider");

    expect(
      await statusCodeOf(() =>
        requireModelPermission(outsider, undefined, "add"),
      ),
    ).toBeUndefined();
  });
});

describe("withAppBase", () => {
  it.each([
    ["/", "/api/profiles/me/", "/api/profiles/me/"],
    ["/backoffice/", "/api/admin/me/", "/backoffice/api/admin/me/"],
    ["/backoffice", "/api/admin/me/", "/backoffice/api/admin/me/"],
    ["/backoffice/", "/backoffice/api/me/", "/backoffice/api/me/"],
    ["/backoffice/", "api/me/", "/backoffice/api/me/"],
    ["/", "api/me/", "/api/me/"],
    ["/back/", "/backend/me/", "/back/backend/me/"],
    [
      "/backoffice/",
      "http://django:8000/api/me/",
      "http://django:8000/api/me/",
    ],
  ])("puts %s and %s together as %s", async (base, path, expected) => {
    const { withAppBase } = await import("../runtime/server/auth/nitro");

    expect(withAppBase(base, path)).toBe(expected);
  });
});

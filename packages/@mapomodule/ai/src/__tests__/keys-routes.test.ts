import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, createRouter, toWebHandler } from "h3";
import { createStorage, prefixStorage } from "unstorage";
import type { Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import type { MapoAiProviderRequest } from "../runtime/server/providers/types";
import {
  readAuditRecord,
  readKeyActionRecord,
} from "../runtime/server/run/audit";
import type {
  MapoAiAuditRecord,
  MapoAiKeyActionRecord,
} from "../runtime/server/run/audit";
import { createSealedStorage } from "../runtime/server/storage/sealed";
import { MAPO_AI_GATEWAY_PATH } from "../runtime/shared/gateway";
import type {
  MapoAiKeyAssignment,
  MapoAiKeyAssignmentInput,
  MapoAiKeysAnswer,
  MapoAiPreviewResponse,
  MapoAiProviderStatus,
  MapoAiRunRequest,
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
  MapoAiStatus,
  MapoAiActionsAnswer,
  MapoAiUsageAnswer,
} from "../runtime/shared/gateway";

const SECRET = "keys-test-secret-0123456789-abcdefghijklm";
const PATH = MAPO_AI_GATEWAY_PATH;

const PROJECT_KEY = "acme-project-000000000000000PRJ1";
const ALL_KEY = "acme-all-00000000000000000000ALL1";
const EDITORS_KEY = "acme-editors-0000000000000000EDT1";
const REPORTERS_KEY = "acme-reporters-00000000000000REP1";
const TOKEN = "acme-token-of-the-writer-0000TOK1";
const SECRETS = [PROJECT_KEY, ALL_KEY, EDITORS_KEY, REPORTERS_KEY, TOKEN];

/** The users of the fake backend, by the value of their session cookie. */
const USERS: Record<string, Record<string, unknown>> = {
  admin: { id: 1, username: "admin", is_superuser: true, groups: ["admin"] },
  editor: {
    id: 2,
    username: "editor",
    is_superuser: false,
    all_permissions: ["view_article", "add_article", "change_article"],
    groups: ["editors"],
  },
  writer: {
    id: 4,
    username: "writer",
    is_superuser: false,
    all_permissions: ["view_article", "add_article", "change_article"],
    groups: ["editors", "reporters"],
  },
};

/** What the mocked `nitropack/runtime` serves: the config, the storage, the backend. */
const runtime = vi.hoisted(() => {
  const state: {
    config: Record<string, unknown>;
    root: Storage | undefined;
  } = { config: {}, root: undefined };
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
      localFetch: (_url: string, init?: RequestInit) => fakeBackend(init),
      hooks: { callHook: async () => undefined },
    }),
  };
});

/** The backend's `userInfoApi`: the user of the session cookie, or 403 as DRF answers. */
function fakeBackend(init?: RequestInit): Response {
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  const session = /(?:^|;\s*)sessionid=([^;]+)/.exec(cookie)?.[1];
  const user = session ? USERS[session] : undefined;
  return user
    ? Response.json(user)
    : Response.json({ detail: "Not signed in" }, { status: 403 });
}

/** The keys each call of the app's provider `acme` got. */
let seen: (string | undefined)[] = [];
/** The models each call of `acme` asked for. */
let models: string[] = [];
/** The keys each listing of `acme`'s models got. */
let listed: (string | undefined)[] = [];
/** The rules each call of `acme` got: layers 1–4 of its prompt. */
let prompts: string[] = [];
/** The schema of each call of `acme`, as text. */
let schemas: string[] = [];

/**
 * The gateway's routes on a bare h3 app, as Nitro mounts them, with the
 * app's provider `acme`: it takes a key, records the one it gets, and
 * answers as the mock. Fresh modules each time.
 */
async function gateway(): Promise<(request: Request) => Promise<Response>> {
  const route = async (file: string) =>
    (await import(`../runtime/server/routes/${file}.ts`)).default;
  const { registerMapoAiProvider } =
    await import("../runtime/server/providers/registry");
  const { mockProvider } = await import("../runtime/server/providers/mock");
  registerMapoAiProvider({
    id: "acme",
    label: "Acme",
    key: "required",
    capabilities: mockProvider.capabilities,
    models: ["acme-1", "acme-2"],
    run: (request: MapoAiProviderRequest) => {
      seen.push(request.apiKey);
      models.push(request.model);
      prompts.push(request.prompt.instructions);
      schemas.push(JSON.stringify(request.schema));
      return mockProvider.run(request);
    },
    // The server has one model more than the app lists, for the admins to add.
    listModels: async (_signal: AbortSignal, apiKey?: string) => {
      listed.push(apiKey);
      return [{ id: "acme-1" }, { id: "acme-2" }, { id: "acme-large" }];
    },
  });
  const router = createRouter()
    .get(`${PATH}/status`, await route("status.get"))
    .post(`${PATH}/run`, await route("run.post"))
    .get(`${PATH}/keys`, await route("keys.get"))
    .put(`${PATH}/keys`, await route("keys.put"))
    .put(`${PATH}/keys/groups`, await route("keys-groups.put"))
    .delete(`${PATH}/keys/:id`, await route("keys-id.delete"))
    .put(`${PATH}/token`, await route("token.put"))
    .delete(`${PATH}/token`, await route("token.delete"))
    .put(`${PATH}/preferences`, await route("preferences.put"))
    .delete(`${PATH}/preferences`, await route("preferences.delete"))
    .post(`${PATH}/test`, await route("test.post"))
    .get(`${PATH}/settings`, await route("settings.get"))
    .put(`${PATH}/settings`, await route("settings.put"))
    .post(`${PATH}/settings/preview`, await route("settings-preview.post"))
    .get(`${PATH}/usage`, await route("usage.get"))
    .get(`${PATH}/usage/mine`, await route("usage-mine.get"))
    .get(`${PATH}/actions`, await route("actions.get"));
  return toWebHandler(createApp().use(router));
}

type Handle = (request: Request) => Promise<Response>;

function request(
  method: string,
  path: string,
  session: string | undefined,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${PATH}${path}`, {
    method,
    headers: {
      ...(session ? { cookie: `sessionid=${session}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function assign(
  handle: Handle,
  input: MapoAiKeyAssignmentInput,
): Promise<MapoAiKeyAssignment> {
  const response = await handle(request("PUT", "/keys", "admin", input));
  expect(response.status).toBe(200);
  const text = await response.text();
  for (const secret of SECRETS) expect(text).not.toContain(secret);
  return JSON.parse(text) as MapoAiKeyAssignment;
}

async function statusOf(
  handle: Handle,
  session: string,
): Promise<MapoAiStatus> {
  const response = await handle(request("GET", "/status", session));
  expect(response.status).toBe(200);
  const text = await response.text();
  for (const secret of SECRETS) expect(text).not.toContain(secret);
  return JSON.parse(text) as MapoAiStatus;
}

async function acmeOf(
  handle: Handle,
  session: string,
): Promise<MapoAiProviderStatus | undefined> {
  const status = await statusOf(handle, session);
  return status.providers?.find((one) => one.id === "acme");
}

const ARTICLE_FIELDS = {
  type: "object",
  properties: { title: { type: "string", title: "Title" } },
};

function fillBody(model?: string): MapoAiRunRequest {
  return {
    task: "fill",
    entity: { fields: ARTICLE_FIELDS, label: "Article", model: "article" },
    parts: [{ kind: "text", text: "Title: About us" }],
    provider: { id: "acme", ...(model ? { model } : {}) },
  };
}

async function runAs(
  handle: Handle,
  session: string,
  model?: string,
): Promise<Response> {
  return handle(request("POST", "/run", session, fillBody(model)));
}

/** The test's sealed storage, opened with its secret. */
function sealed(secret = SECRET) {
  if (!runtime.root) throw new Error("No root storage in this test");
  return createSealedStorage({
    storage: prefixStorage(runtime.root, "mapo-ai"),
    secret,
  });
}

async function auditOf(): Promise<{
  calls: MapoAiAuditRecord[];
  actions: MapoAiKeyActionRecord[];
}> {
  const store = sealed().store("audit");
  const calls: MapoAiAuditRecord[] = [];
  const actions: MapoAiKeyActionRecord[] = [];
  for (const key of await store.keys()) {
    const call = await store.get(key, readAuditRecord);
    if (call) calls.push(call);
    const action = await store.get(key, readKeyActionRecord);
    if (action) actions.push(action);
  }
  actions.sort((a, b) => (a.at < b.at ? -1 : 1));
  return { calls, actions };
}

/** Every value of the storage, as the driver holds it. */
async function rawStorage(): Promise<string> {
  if (!runtime.root) return "";
  const keys = await runtime.root.getKeys("mapo-ai");
  const values = await Promise.all(
    keys.map((key) => runtime.root?.getItem(key)),
  );
  return JSON.stringify(values);
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  seen = [];
  models = [];
  listed = [];
  prompts = [];
  schemas = [];
  const root = createStorage();
  root.mount("mapo-ai", memoryDriver());
  runtime.root = root;
  runtime.config = {
    app: { baseURL: "/" },
    public: { mapoCore: { userInfoApi: "/api/profiles/me/" } },
    mapoAi: {
      secret: SECRET,
      admin: {},
      providers: {
        acme: { timeout: 5, apiKey: PROJECT_KEY },
        mock: { timeout: 5 },
      },
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the routes of the keys — who may use them", () => {
  it("answers 401 without a session, and 403 to a user who is no AI admin", async () => {
    const handle = await gateway();

    expect((await handle(request("GET", "/keys", undefined))).status).toBe(401);
    expect((await handle(request("GET", "/keys", "editor"))).status).toBe(403);
    const put = await handle(
      request("PUT", "/keys", "editor", {
        scope: { kind: "all" },
        provider: "acme",
      }),
    );
    expect(put.status).toBe(403);
    expect(
      (await handle(request("PUT", "/keys/groups", "editor", { groups: [] })))
        .status,
    ).toBe(403);
    expect(
      (await handle(request("DELETE", "/keys/0000000000000001", "editor")))
        .status,
    ).toBe(403);
  });

  it("refuses a change sent from another site", async () => {
    const handle = await gateway();

    const response = await handle(
      request(
        "PUT",
        "/keys",
        "admin",
        { scope: { kind: "all" }, provider: "acme", key: ALL_KEY },
        { "sec-fetch-site": "cross-site" },
      ),
    );

    expect(response.status).toBe(403);
    expect(await rawStorage()).toBe("[]");
  });

  it("refuses a body that is not JSON, or not an assignment", async () => {
    const handle = await gateway();

    const notJson = await handle(
      new Request(`http://localhost${PATH}/keys`, {
        method: "PUT",
        headers: { cookie: "sessionid=admin", "content-type": "text/plain" },
        body: "acme",
      }),
    );
    const notAssignment = await handle(
      request("PUT", "/keys", "admin", { scope: { kind: "all" } }),
    );

    expect(notJson.status).toBe(415);
    expect(notAssignment.status).toBe(400);
  });

  it("answers 503 when the storage is closed: without it there are the project's keys only", async () => {
    runtime.config.mapoAi = {
      ...(runtime.config.mapoAi as object),
      secret: "",
    };
    const handle = await gateway();

    expect((await handle(request("GET", "/keys", "admin"))).status).toBe(503);
    expect(
      (
        await handle(
          request("PUT", "/token", "writer", {
            provider: "acme",
            token: TOKEN,
          }),
        )
      ).status,
    ).toBe(503);
    expect((await acmeOf(handle, "editor"))?.key).toMatchObject({
      level: "project",
      last4: "PRJ1",
    });
  });
});

describe("the keys an admin assigns", () => {
  it("lists the providers, the assignments and the order of the groups, never a key", async () => {
    const handle = await gateway();
    const saved = await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      key: EDITORS_KEY,
      models: ["acme-2"],
    });

    const response = await handle(request("GET", "/keys", "admin"));
    const text = await response.text();
    const answer = JSON.parse(text) as MapoAiKeysAnswer;

    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(answer).toEqual({
      providers: [
        {
          id: "acme",
          label: "Acme",
          models: ["acme-1", "acme-2"],
          key: "required",
        },
        { id: "mock", label: "Mock", models: ["mock"] },
      ],
      assignments: [saved],
      groups: [],
      tokens: [],
    });
    expect(saved).toMatchObject({
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      models: ["acme-2"],
      key: { last4: "EDT1" },
      personalTokens: false,
      updated: { by: { id: "1", username: "admin" } },
    });
    expect(await rawStorage()).not.toContain(EDITORS_KEY);
  });

  it("tells each user, in status, which level gives their key", async () => {
    const handle = await gateway();

    expect((await acmeOf(handle, "editor"))?.key).toEqual({
      level: "project",
      last4: "PRJ1",
      required: true,
      personal: { allowed: false, saved: false },
    });

    await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      key: ALL_KEY,
    });
    expect((await acmeOf(handle, "editor"))?.key).toMatchObject({
      level: "all",
      last4: "ALL1",
    });

    await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      key: EDITORS_KEY,
    });
    await assign(handle, {
      scope: { kind: "group", group: "reporters" },
      provider: "acme",
      key: REPORTERS_KEY,
    });
    expect((await acmeOf(handle, "editor"))?.key).toMatchObject({
      level: "group",
      group: "editors",
    });
    // Two groups and no order: by name.
    expect((await acmeOf(handle, "writer"))?.key).toMatchObject({
      level: "group",
      group: "editors",
    });

    const ordered = await handle(
      request("PUT", "/keys/groups", "admin", {
        groups: ["reporters", "editors"],
      }),
    );
    expect(await ordered.json()).toEqual({ groups: ["reporters", "editors"] });
    expect((await acmeOf(handle, "writer"))?.key).toMatchObject({
      level: "group",
      group: "reporters",
      last4: "REP1",
    });

    await assign(handle, {
      scope: { kind: "user", user: "4" },
      provider: "acme",
      key: ALL_KEY,
    });
    expect((await acmeOf(handle, "writer"))?.key).toMatchObject({
      level: "user",
    });
  });

  it("calls the app's provider with the key the chain chose, and audits its level", async () => {
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      key: EDITORS_KEY,
    });

    expect((await runAs(handle, "editor")).status).toBe(200);
    expect((await runAs(handle, "admin")).status).toBe(200);

    expect(seen).toEqual([EDITORS_KEY, PROJECT_KEY]);
    const { calls } = await auditOf();
    expect(calls.map((call) => [call.user.id, call.key])).toEqual(
      expect.arrayContaining([
        ["2", { level: "group", group: "editors" }],
        ["1", { level: "project" }],
      ]),
    );
    expect(await rawStorage()).not.toContain(EDITORS_KEY);
  });

  it("refuses a provider no level gives a key, before calling it, and defaults to one that can be called", async () => {
    runtime.config.mapoAi = {
      ...(runtime.config.mapoAi as object),
      providers: { acme: { timeout: 5 }, mock: { timeout: 5 } },
      default: { provider: "acme" },
    };
    const handle = await gateway();

    const status = await statusOf(handle, "editor");
    const response = await runAs(handle, "editor");

    expect(status.providers?.[0]?.key).toMatchObject({
      level: "none",
      required: true,
    });
    expect(status.default).toEqual({
      provider: "mock",
      models: { fill: "mock", extract: "mock" },
    });
    expect(response.status).toBe(503);
    expect((await response.json()).statusMessage).toBe(
      "This AI provider has no key",
    );
    expect(seen).toEqual([]);
    expect((await auditOf()).calls).toEqual([]);
  });

  it("narrows the models of a scope, and closes a provider to it", async () => {
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      models: ["acme-2"],
    });

    expect((await acmeOf(handle, "editor"))?.models).toEqual(["acme-2"]);
    expect((await runAs(handle, "editor", "acme-1")).status).toBe(403);
    expect((await runAs(handle, "editor", "acme-2")).status).toBe(200);
    // The writer's own assignment is nearer than their groups'.
    await assign(handle, {
      scope: { kind: "user", user: "4" },
      provider: "acme",
      models: [],
    });
    expect(await acmeOf(handle, "writer")).toBeUndefined();
    expect((await runAs(handle, "writer")).status).toBe(403);
    expect(seen).toEqual([PROJECT_KEY]);
  });

  it("removes an assignment by its id, and answers 404 for an id it does not have", async () => {
    const handle = await gateway();
    const saved = await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      key: ALL_KEY,
    });

    const removed = await handle(
      request("DELETE", `/keys/${saved.id}`, "admin"),
    );
    const again = await handle(request("DELETE", `/keys/${saved.id}`, "admin"));

    expect(removed.status).toBe(204);
    expect(again.status).toBe(404);
    expect((await acmeOf(handle, "editor"))?.key?.level).toBe("project");
  });

  it("closes the AI while the keys cannot be read, and keeps their record", async () => {
    const other = sealed("another-secret-0123456789-abcdefghijklmnop");
    await other.store("keys").set("assignments", {
      v: 1,
      assignments: [],
      groups: [],
    });
    const handle = await gateway();

    expect((await handle(request("GET", "/status", "editor"))).status).toBe(
      503,
    );
    expect((await runAs(handle, "editor")).status).toBe(503);
    expect((await handle(request("GET", "/keys", "admin"))).status).toBe(503);
    expect(
      (
        await handle(
          request("PUT", "/keys", "admin", {
            scope: { kind: "all" },
            provider: "acme",
          }),
        )
      ).status,
    ).toBe(503);
    expect(seen).toEqual([]);
    expect(await other.store("keys").keys()).toEqual(["assignments"]);
  });
});

/**
 * A memory driver that writes the record of the keys as a file system
 * does, in place: `hold()` makes the next write of the record stop halfway,
 * half a value in the driver, until it is released; `truncateNextRead()`
 * makes the next read of the record find half of it, as a write of another
 * process in progress would leave it.
 */
function inPlaceDriver() {
  const inner = memoryDriver();
  const isRecord = (key: string) => key.endsWith("assignments.sealed");
  let holding: { halfway: () => void; released: Promise<void> } | undefined;
  let truncating = false;
  const driver = {
    ...inner,
    async setItem(key: string, value: string) {
      const held = holding;
      if (isRecord(key) && held) {
        holding = undefined;
        await inner.setItem?.(key, value.slice(0, 20), {});
        held.halfway();
        await held.released;
      }
      await inner.setItem?.(key, value, {});
    },
    async getItem(key: string) {
      const value = await inner.getItem(key, {});
      if (!isRecord(key) || !truncating) return value;
      truncating = false;
      return typeof value === "string" ? value.slice(0, 20) : value;
    },
  };
  return {
    driver,
    hold() {
      let halfway!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => (halfway = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      holding = { halfway, released };
      return { reached, release };
    },
    truncateNextRead() {
      truncating = true;
    },
  };
}

function mountInPlace(): ReturnType<typeof inPlaceDriver> {
  const inPlace = inPlaceDriver();
  const root = createStorage();
  root.mount("mapo-ai", inPlace.driver);
  runtime.root = root;
  return inPlace;
}

describe("the record of the keys, read while it is written", () => {
  it("waits for a save of the same process instead of reading half a record", async () => {
    const inPlace = mountInPlace();
    const handle = await gateway();
    const write = inPlace.hold();

    const saving = handle(
      request("PUT", "/keys", "admin", {
        scope: { kind: "all" },
        provider: "acme",
        key: ALL_KEY,
      }),
    );
    await write.reached;
    const reading = handle(request("GET", "/status", "editor"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    write.release();

    expect((await saving).status).toBe(200);
    const status = await reading;
    expect(status.status).toBe(200);
    const answer = (await status.json()) as MapoAiStatus;
    expect(answer.providers?.[0]?.key?.level).toBe("all");
  });

  it("reads the record again when another process left it half written", async () => {
    const inPlace = mountInPlace();
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      key: ALL_KEY,
    });

    inPlace.truncateNextRead();
    const response = await handle(request("GET", "/status", "editor"));

    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as MapoAiStatus).providers?.[0]?.key?.level,
    ).toBe("all");
  });

  it("keeps both of two assignments saved at the same time", async () => {
    const handle = await gateway();

    const responses = await Promise.all(
      ["editors", "reporters"].map((group) =>
        handle(
          request("PUT", "/keys", "admin", {
            scope: { kind: "group", group },
            provider: "acme",
            key: group === "editors" ? EDITORS_KEY : REPORTERS_KEY,
          }),
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const answer = (await (
      await handle(request("GET", "/keys", "admin"))
    ).json()) as MapoAiKeysAnswer;
    expect(
      answer.assignments.map((one) =>
        one.scope.kind === "group" ? one.scope.group : one.scope.kind,
      ),
    ).toEqual(expect.arrayContaining(["editors", "reporters"]));
    expect(answer.assignments).toHaveLength(2);
  });
});

describe("the users' own tokens", () => {
  it("are refused until an assignment allows them, then used, and never once forbidden", async () => {
    const handle = await gateway();
    const put = () =>
      handle(
        request("PUT", "/token", "writer", { provider: "acme", token: TOKEN }),
      );

    expect((await put()).status).toBe(403);

    const assignment = await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      key: EDITORS_KEY,
      personalTokens: true,
    });
    expect((await put()).status).toBe(204);
    expect((await acmeOf(handle, "writer"))?.key).toEqual({
      level: "personal",
      last4: "TOK1",
      required: true,
      personal: { allowed: true, saved: true, last4: "TOK1" },
    });
    // The editor saved none: the group's key.
    expect((await acmeOf(handle, "editor"))?.key?.level).toBe("group");
    expect((await runAs(handle, "writer")).status).toBe(200);

    await assign(handle, {
      scope: assignment.scope,
      provider: "acme",
      personalTokens: false,
    });
    expect((await acmeOf(handle, "writer"))?.key).toMatchObject({
      level: "group",
      personal: { allowed: false, saved: true },
    });
    expect((await runAs(handle, "writer")).status).toBe(200);

    expect(seen).toEqual([TOKEN, EDITORS_KEY]);
    expect(await rawStorage()).not.toContain(TOKEN);
  });

  it("are removed by their user, or by an admin, and listed to admins without the token", async () => {
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      personalTokens: true,
    });
    for (const session of ["writer", "editor"]) {
      const saved = await handle(
        request("PUT", "/token", session, { provider: "acme", token: TOKEN }),
      );
      expect(saved.status).toBe(204);
    }

    const listed = await handle(request("GET", "/keys", "admin"));
    const text = await listed.text();
    expect(text).not.toContain(TOKEN);
    expect((JSON.parse(text) as MapoAiKeysAnswer).tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: { id: "4", username: "writer" },
          provider: "acme",
          last4: "TOK1",
        }),
        expect.objectContaining({ user: { id: "2", username: "editor" } }),
      ]),
    );

    const notMine = await handle(
      request("DELETE", "/token?provider=acme&user=2", "writer"),
    );
    const mine = await handle(
      request("DELETE", "/token?provider=acme", "writer"),
    );
    const byAdmin = await handle(
      request("DELETE", "/token?provider=acme&user=2", "admin"),
    );

    expect(notMine.status).toBe(403);
    expect(mine.status).toBe(204);
    expect(byAdmin.status).toBe(204);
    const after = (await (
      await handle(request("GET", "/keys", "admin"))
    ).json()) as MapoAiKeysAnswer;
    expect(after.tokens).toEqual([]);
    expect((await acmeOf(handle, "writer"))?.key?.personal.saved).toBe(false);
  });
});

describe("the audit of the keys", () => {
  it("keeps who changed what, and never a key", async () => {
    const handle = await gateway();
    const saved = await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      key: ALL_KEY,
      personalTokens: true,
    });
    await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      models: ["acme-1"],
    });
    await handle(
      request("PUT", "/keys/groups", "admin", { groups: ["editors"] }),
    );
    await handle(
      request("PUT", "/token", "writer", { provider: "acme", token: TOKEN }),
    );
    await handle(request("DELETE", "/token?provider=acme&user=4", "admin"));
    // Nothing to remove: no record.
    await handle(request("DELETE", "/token?provider=acme", "editor"));
    await handle(request("DELETE", `/keys/${saved.id}`, "admin"));

    const { actions } = await auditOf();

    expect(
      actions.map(({ by, action, provider, scope, user, keyChanged }) => ({
        by: by.id,
        action,
        provider,
        scope,
        user,
        keyChanged,
      })),
    ).toEqual([
      {
        by: "1",
        action: "assignment-saved",
        provider: "acme",
        scope: { kind: "all" },
        user: undefined,
        keyChanged: true,
      },
      {
        by: "1",
        action: "assignment-saved",
        provider: "acme",
        scope: { kind: "all" },
        user: undefined,
        keyChanged: false,
      },
      {
        by: "1",
        action: "groups-ordered",
        provider: undefined,
        scope: undefined,
        user: undefined,
        keyChanged: undefined,
      },
      {
        by: "4",
        action: "token-saved",
        provider: "acme",
        scope: undefined,
        user: "4",
        keyChanged: undefined,
      },
      {
        by: "1",
        action: "token-removed",
        provider: "acme",
        scope: undefined,
        user: "4",
        keyChanged: undefined,
      },
      {
        by: "1",
        action: "assignment-removed",
        provider: "acme",
        scope: { kind: "all" },
        user: undefined,
        keyChanged: undefined,
      },
    ]);
    expect(JSON.stringify(actions)).not.toMatch(/acme-(all|token)/);
  });
});

describe("the AI settings' routes", () => {
  it("saves the user's preference, which becomes their default, and removes it", async () => {
    const handle = await gateway();

    const saved = await handle(
      request("PUT", "/preferences", "editor", {
        provider: "acme",
        model: "acme-2",
      }),
    );
    const status = await statusOf(handle, "editor");
    const run = await handle(
      request("POST", "/run", "editor", {
        ...fillBody(),
        provider: undefined,
      }),
    );
    const removed = await handle(request("DELETE", "/preferences", "editor"));
    const after = await statusOf(handle, "editor");

    expect(saved.status).toBe(204);
    expect(status.preference).toEqual({ provider: "acme", model: "acme-2" });
    expect(status.default).toEqual({
      provider: "acme",
      models: { fill: "acme-2", extract: "acme-2" },
    });
    expect(run.status).toBe(200);
    expect(models).toEqual(["acme-2"]);
    expect(removed.status).toBe(204);
    expect(after.preference).toBeUndefined();
    expect(after.default?.provider).toBe("acme");
    expect(after.default?.models.fill).toBe("acme-1");
  });

  it("refuses a preference the user is not given, and keeps one an admin closed without applying it", async () => {
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      models: ["acme-1"],
    });

    const refused = await handle(
      request("PUT", "/preferences", "editor", {
        provider: "acme",
        model: "acme-2",
      }),
    );
    expect(refused.status).toBe(403);

    expect(
      (
        await handle(
          request("PUT", "/preferences", "writer", {
            provider: "acme",
            model: "acme-2",
          }),
        )
      ).status,
    ).toBe(403);
    await handle(
      request("PUT", "/preferences", "admin", {
        provider: "acme",
        model: "acme-2",
      }),
    );
    await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      models: ["acme-1"],
    });
    const status = await statusOf(handle, "admin");

    expect(status.preference).toEqual({ provider: "acme", model: "acme-2" });
    expect(status.default?.models.fill).toBe("acme-1");
  });

  it("checks the connection with the key the user's calls use", async () => {
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "group", group: "editors" },
      provider: "acme",
      key: EDITORS_KEY,
    });

    const response = await handle(
      request("POST", "/test", "editor", { provider: "acme", model: "acme-2" }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      provider: "acme",
      model: "acme-2",
      outcome: "connected",
    });
    expect(listed).toEqual([EDITORS_KEY]);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(seen).toEqual([]);
  });

  it("checks no provider without a key, nor one or a model the user is not given", async () => {
    runtime.config.mapoAi = {
      ...(runtime.config.mapoAi as object),
      providers: { acme: { timeout: 5 }, mock: { timeout: 5 } },
    };
    const handle = await gateway();

    const noKey = await handle(
      request("POST", "/test", "editor", { provider: "acme" }),
    );
    const unknown = await handle(
      request("POST", "/test", "editor", { provider: "openai" }),
    );
    const notGiven = await handle(
      request("POST", "/test", "editor", { provider: "acme", model: "x" }),
    );
    const mock = await handle(
      request("POST", "/test", "editor", { provider: "mock" }),
    );

    expect(await noKey.json()).toMatchObject({ outcome: "no-key" });
    expect(unknown.status).toBe(403);
    expect(notGiven.status).toBe(403);
    expect(await mock.json()).toMatchObject({
      provider: "mock",
      outcome: "unverifiable",
    });
    expect(listed).toEqual([]);
  });

  it("allows ten checks a minute", async () => {
    const handle = await gateway();
    const statuses: number[] = [];

    for (let index = 0; index < 11; index += 1) {
      const response = await handle(
        request("POST", "/test", "editor", { provider: "acme" }),
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("refuses a preference or a check sent from another site", async () => {
    const handle = await gateway();
    const crossSite = { "sec-fetch-site": "cross-site" };

    const saved = await handle(
      request(
        "PUT",
        "/preferences",
        "editor",
        { provider: "acme", model: "acme-1" },
        crossSite,
      ),
    );
    const removed = await handle(
      request("DELETE", "/preferences", "editor", undefined, crossSite),
    );
    const checked = await handle(
      request("POST", "/test", "editor", { provider: "acme" }, crossSite),
    );

    expect([saved.status, removed.status, checked.status]).toEqual([
      403, 403, 403,
    ]);
    expect(listed).toEqual([]);
  });

  it("answers 503 to a preference without a storage", async () => {
    runtime.config.mapoAi = {
      ...(runtime.config.mapoAi as object),
      secret: "",
    };
    const handle = await gateway();

    const response = await handle(
      request("PUT", "/preferences", "editor", {
        provider: "acme",
        model: "acme-1",
      }),
    );

    expect(response.status).toBe(503);
  });
});

describe("the routes of the AI settings — how the AI works", () => {
  /** Saves a change of the settings as the admin; the answer, or the refusal's status. */
  async function change(
    handle: Handle,
    input: MapoAiSettingsInput | Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await handle(request("PUT", "/settings", "admin", input));
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }

  /** Enables more providers, and options of acme, before the gateway is built. */
  function withProviders(providers: Record<string, unknown>) {
    const config = runtime.config.mapoAi as Record<string, unknown>;
    config.providers = {
      ...(config.providers as Record<string, unknown>),
      ...providers,
    };
  }

  it("answers the AI's admins only", async () => {
    const handle = await gateway();

    const statuses = await Promise.all([
      handle(request("GET", "/settings", undefined)),
      handle(request("GET", "/settings", "editor")),
      handle(request("PUT", "/settings", "editor", { secretWords: [] })),
      handle(request("POST", "/settings/preview", "editor", { task: "fill" })),
    ]);

    expect(statuses.map((response) => response.status)).toEqual([
      401, 403, 403, 403,
    ]);
  });

  it("refuses a change sent from another site", async () => {
    const handle = await gateway();

    const response = await handle(
      request(
        "PUT",
        "/settings",
        "admin",
        { secretWords: ["vault"] },
        { "sec-fetch-site": "cross-site" },
      ),
    );

    expect(response.status).toBe(403);
  });

  it("answers the app's settings before any admin changed them", async () => {
    const handle = await gateway();

    const response = await handle(request("GET", "/settings", "admin"));
    const answer = (await response.json()) as MapoAiSettingsAnswer;

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(answer.instructions.admin).toEqual({
      all: "",
      fill: "",
      extract: "",
    });
    expect(answer.verification.admin).toEqual({});
    expect(answer.secretWords.mapo).toContain("credentials");
    expect(answer.secretWords.admin).toEqual([]);
    expect(answer.providers.find((one) => one.id === "acme")).toEqual({
      id: "acme",
      label: "Acme",
      models: { app: ["acme-1", "acme-2"], added: [], canAdd: false },
    });
    expect(answer).not.toHaveProperty("updated");
  });

  it("saves block by block, and audits who changed which blocks, never the instructions", async () => {
    const handle = await gateway();

    const first = await change(handle, {
      instructions: { all: "Write titles without the date." },
    });
    const second = await change(handle, {
      verification: { soleNumber: false, oneWordQuotes: "never" },
    });

    expect([first.status, second.status]).toEqual([200, 200]);
    const answer = second.body as unknown as MapoAiSettingsAnswer;
    expect(answer.instructions.admin.all).toBe(
      "Write titles without the date.",
    );
    expect(answer.verification.admin).toEqual({
      soleNumber: false,
      oneWordQuotes: "never",
    });
    expect(answer.updated?.by).toEqual({ id: "1", username: "admin" });
    const { actions } = await auditOf();
    expect(
      actions.map(({ action, blocks, loosened }) => ({
        action,
        blocks,
        loosened,
      })),
    ).toEqual([
      {
        action: "settings-saved",
        blocks: ["instructions"],
        loosened: undefined,
      },
      {
        action: "settings-saved",
        blocks: ["verification"],
        loosened: ["soleNumber"],
      },
    ]);
    const raw = await rawStorage();
    expect(raw).not.toContain("Write titles without the date.");
  });

  it("puts the admins' instructions after the app's, and keeps their words of secrets out of the contract", async () => {
    (runtime.config.mapoAi as Record<string, unknown>).instructions = {
      all: "Prices are in euros.",
    };
    const handle = await gateway();
    await change(handle, {
      instructions: { fill: "Write titles without the date." },
      secretWords: ["vault"],
    });

    const response = await handle(
      request("POST", "/run", "editor", {
        ...fillBody(),
        entity: {
          fields: {
            type: "object",
            properties: {
              title: { type: "string", title: "Title" },
              vault_url: { type: "string", title: "Vault" },
            },
          },
          label: "Article",
          model: "article",
        },
      }),
    );

    expect(response.status).toBe(200);
    const [prompt = ""] = prompts;
    const app = prompt.indexOf("Prices are in euros.");
    const admin = prompt.indexOf("Write titles without the date.");
    expect(app).toBeGreaterThan(0);
    expect(admin).toBeGreaterThan(app);
    expect(schemas[0]).toContain("title");
    expect(schemas[0]).not.toContain("vault_url");
  });

  it("adds a model the provider's server lists, asked with the admin's key, where the app allows it", async () => {
    withProviders({
      acme: { timeout: 5, apiKey: PROJECT_KEY, adminModels: true },
    });
    const handle = await gateway();

    const saved = await change(handle, {
      providers: { acme: { models: ["acme-large"] } },
    });

    expect(saved.status).toBe(200);
    expect(listed).toEqual([PROJECT_KEY]);
    const keys = (await (
      await handle(request("GET", "/keys", "admin"))
    ).json()) as MapoAiKeysAnswer;
    expect(keys.providers.find((one) => one.id === "acme")?.models).toEqual([
      "acme-1",
      "acme-2",
      "acme-large",
    ]);
    expect((await acmeOf(handle, "editor"))?.models).toEqual([
      "acme-1",
      "acme-2",
      "acme-large",
    ]);
    // Saved once: the next change asks the server nothing about it.
    await change(handle, { providers: { acme: { models: ["acme-large"] } } });
    expect(listed).toEqual([PROJECT_KEY]);
  });

  it("refuses a model the server does not list, or where the app allows none, before saving it", async () => {
    const handle = await gateway();

    const notAllowed = await change(handle, {
      providers: { acme: { models: ["acme-large"] } },
    });
    expect(notAllowed.status).toBe(403);
    expect(listed).toEqual([]);

    withProviders({
      acme: { timeout: 5, apiKey: PROJECT_KEY, adminModels: true },
    });
    // A gateway built again, with fresh modules, reads the new options.
    vi.resetModules();
    const allowed = await gateway();
    const unknown = await change(allowed, {
      providers: { acme: { models: ["acme-ghost"] } },
    });
    expect(unknown.status).toBe(422);
    expect(unknown.body.data).toEqual({ model: "acme-ghost" });
    expect((await acmeOf(allowed, "editor"))?.models).toEqual([
      "acme-1",
      "acme-2",
    ]);
  });

  it("keeps Anthropic's fallbacks off where the app turns them off, and lets the admins turn them off", async () => {
    withProviders({ anthropic: { fallbacks: false } });
    const off = await gateway();

    expect(
      (await change(off, { providers: { anthropic: { fallbacks: true } } }))
        .status,
    ).toBe(403);

    withProviders({ anthropic: {} });
    vi.resetModules();
    const on = await gateway();
    const saved = await change(on, {
      providers: { anthropic: { fallbacks: false } },
    });
    const answer = saved.body as unknown as MapoAiSettingsAnswer;
    expect(
      answer.providers.find((one) => one.id === "anthropic")?.fallbacks,
    ).toEqual({ app: true, admin: false, value: false });
  });

  it("refuses a body that is not a change, naming where", async () => {
    const handle = await gateway();

    const refused = await Promise.all([
      change(handle, { secretWords: ["vault", "no!"] }),
      change(handle, { providers: { nowhere: {} } }),
      change(handle, { providers: { acme: { promptCache: true } } }),
      change(handle, { verification: { years: true } }),
    ]);

    expect(refused.map((one) => one.status)).toEqual([400, 400, 400, 400]);
    expect(refused[0]?.body.data).toEqual({
      path: "secretWords.1",
      problem:
        "a word of a key: letters, digits, spaces, _, - and ., up to 64 characters",
    });
  });

  it("shows the rules the model reads, with instructions not saved yet or the saved ones", async () => {
    (runtime.config.mapoAi as Record<string, unknown>).instructions = {
      all: "Prices are in euros.",
    };
    const handle = await gateway();
    await change(handle, { instructions: { all: "Saved rule." } });

    const preview = async (body: Record<string, unknown>) =>
      (await (
        await handle(request("POST", "/settings/preview", "admin", body))
      ).json()) as MapoAiPreviewResponse;
    const draft = await preview({
      task: "fill",
      instructions: { all: "Draft rule." },
    });
    const saved = await preview({ task: "extract" });

    expect(draft.text).toContain("Prices are in euros.");
    expect(draft.text).toContain("Draft rule.");
    expect(draft.text).not.toContain("Saved rule.");
    expect(saved.text).toContain("Saved rule.");
    expect(prompts).toEqual([]);
  });

  it("closes the AI while the settings cannot be read", async () => {
    await sealed("another-secret-0123456789-abcdefghijklmnop")
      .store("settings")
      .set("admin", { v: 1 });
    const handle = await gateway();

    const status = await handle(request("GET", "/status", "editor"));
    const run = await runAs(handle, "editor");

    expect([status.status, run.status]).toEqual([503, 503]);
    expect(seen).toEqual([]);
  });

  it("answers 503 without a storage", async () => {
    (runtime.config.mapoAi as Record<string, unknown>).secret = "";
    const handle = await gateway();

    const response = await handle(request("GET", "/settings", "admin"));

    expect(response.status).toBe(503);
  });
});

describe("the routes of the usage and of the changes", () => {
  async function usageOf(
    handle: Handle,
    path: string,
    session: string,
  ): Promise<MapoAiUsageAnswer> {
    const response = await handle(request("GET", path, session));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    return JSON.parse(text) as MapoAiUsageAnswer;
  }

  it("keeps everyone's usage and the changes to the AI's admins, and a user's own to them", async () => {
    const handle = await gateway();

    const statuses = await Promise.all([
      handle(request("GET", "/usage", undefined)),
      handle(request("GET", "/usage", "editor")),
      handle(request("GET", "/actions", "editor")),
      handle(request("GET", "/usage/mine", undefined)),
      handle(request("GET", "/usage/mine", "editor")),
    ]);

    expect(statuses.map((response) => response.status)).toEqual([
      401, 403, 403, 401, 200,
    ]);
  });

  it("sums every user's calls for the admins, and only the user's own for them, never what was sent", async () => {
    (runtime.config.mapoAi as Record<string, unknown>).prices = {
      currency: "EUR",
      providers: { acme: { "acme-1": { input: 1, output: 2 } } },
    };
    const handle = await gateway();
    await runAs(handle, "editor");
    await runAs(handle, "editor", "acme-2");
    await runAs(handle, "writer");

    const all = await usageOf(handle, "/usage?days=7", "admin");
    const mine = await usageOf(handle, "/usage/mine", "editor");

    expect(all.days).toBe(7);
    expect(all.currency).toBe("EUR");
    expect(all.totals.calls).toBe(3);
    expect(all.byUser?.map((row) => [row.user.username, row.calls])).toEqual([
      ["editor", 2],
      ["writer", 1],
    ]);
    expect(all.byModel.map((row) => row.model).sort()).toEqual([
      "acme-1",
      "acme-2",
    ]);
    // acme-1 is priced, acme-2 is not.
    expect(all.totals.cost).toBeGreaterThan(0);
    expect(all.totals.unpricedCalls).toBe(1);
    expect(mine.totals.calls).toBe(2);
    expect(mine).not.toHaveProperty("byUser");
    expect(mine.recent.every((one) => one.user.id === "2")).toBe(true);
    expect(JSON.stringify(all)).not.toContain("About us");
  });

  it("lists the changes of the keys and of the settings, newest first, never a key", async () => {
    const handle = await gateway();
    await assign(handle, {
      scope: { kind: "all" },
      provider: "acme",
      key: ALL_KEY,
    });
    await handle(
      request("PUT", "/settings", "admin", {
        verification: { soleNumber: false },
      }),
    );

    const response = await handle(request("GET", "/actions?days=1", "admin"));
    const text = await response.text();
    const answer = JSON.parse(text) as MapoAiActionsAnswer;

    expect(answer.actions.map((one) => one.action)).toEqual([
      "settings-saved",
      "assignment-saved",
    ]);
    expect(answer.actions[0]?.loosened).toEqual(["soleNumber"]);
    expect(answer.actions[1]).toMatchObject({
      by: { id: "1", username: "admin" },
      provider: "acme",
      scope: { kind: "all" },
      keyChanged: true,
    });
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it("refuses days it cannot read, and answers 503 without a storage", async () => {
    const handle = await gateway();

    const refused = await handle(request("GET", "/usage?days=0", "admin"));
    (runtime.config.mapoAi as Record<string, unknown>).secret = "";
    vi.resetModules();
    const closed = await gateway();
    const noStorage = await closed(request("GET", "/usage/mine", "editor"));

    expect([refused.status, noStorage.status]).toEqual([400, 503]);
  });
});

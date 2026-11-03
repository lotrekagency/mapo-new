import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStorage, prefixStorage } from "unstorage";
import type { Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createSealedStorage } from "../runtime/server/storage/sealed";

const SECRET = "plugin-test-secret-0123456789-abcdefghijk";
const START = Date.UTC(2026, 10, 3, 12);
const HOUR = 60 * 60 * 1000;

/** What the mocked `nitropack/runtime` serves: the root storage and the runtime config. */
const runtime = vi.hoisted(() => {
  const state: { root: Storage | undefined; config: Record<string, unknown> } =
    {
      root: undefined,
      config: {},
    };
  return state;
});

vi.mock("nitropack/runtime", async () => {
  const { prefixStorage: prefix } = await import("unstorage");
  const root = (): Storage => {
    if (!runtime.root) throw new Error("No root storage in this test");
    return runtime.root;
  };
  return {
    defineNitroPlugin: (plugin: unknown) => plugin,
    useRuntimeConfig: () => runtime.config,
    useStorage: (base = "") => (base ? prefix(root(), base) : root()),
  };
});

/** The hooks a fake Nitro app collects, by name. */
type Hooks = Map<string, Array<() => void>>;

/** Loads a fresh copy of the plugin and runs it on a fake app with only the hooks it uses. */
async function runPlugin(): Promise<Hooks> {
  const hooks: Hooks = new Map();
  const app = {
    hooks: {
      hook: (name: string, fn: () => void) => {
        hooks.set(name, [...(hooks.get(name) ?? []), fn]);
        return () => {
          hooks.set(
            name,
            (hooks.get(name) ?? []).filter((hooked) => hooked !== fn),
          );
        };
      },
    },
  };
  // Read as unknown: the fake app has only the hooks, not the whole NitroApp.
  const plugin: unknown = (await import("../runtime/server/plugins/storage"))
    .default;
  if (typeof plugin !== "function") throw new Error("Not a plugin");
  plugin(app);
  return hooks;
}

function call(hooks: Hooks, name: string): void {
  for (const fn of hooks.get(name) ?? []) fn();
}

/** A root storage with a memory driver mounted at `mapo-ai`, as the module's default would. */
function mountedRoot(): Storage {
  const root = createStorage();
  root.mount("mapo-ai", memoryDriver());
  return root;
}

/** Seals a record in the mount that expires `inMs` after now. */
async function sealExpiring(
  root: Storage,
  key: string,
  inMs: number,
): Promise<void> {
  const sealed = createSealedStorage({
    storage: prefixStorage(root, "mapo-ai"),
    secret: SECRET,
    now: () => START - 1,
  });
  await sealed.store("staging").set(key, { key }, { expiresAt: START + inMs });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(START);
  runtime.root = undefined;
  runtime.config = { mapoAi: { secret: SECRET } };
});

afterEach(() => {
  // The stubbed setTimeout goes first, so the real timers come back last.
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the storage plugin", () => {
  it("sweeps once the app's own plugins have run, not while they run", async () => {
    runtime.root = mountedRoot();
    await sealExpiring(runtime.root, "old", 0);
    await sealExpiring(runtime.root, "fresh", 2 * HOUR);

    await runPlugin();
    expect(await runtime.root.getKeys("mapo-ai")).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(0);
    expect(await runtime.root.getKeys("mapo-ai")).toEqual([
      "mapo-ai:staging:fresh.sealed",
    ]);
  });

  it("sweeps again every hour", async () => {
    runtime.root = mountedRoot();
    await sealExpiring(runtime.root, "soon", 30 * 60 * 1000);
    await runPlugin();
    await vi.advanceTimersByTimeAsync(0);
    expect(await runtime.root.getKeys("mapo-ai")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(await runtime.root.getKeys("mapo-ai")).toEqual([]);
  });

  it("finds the driver an app plugin mounts when the server starts", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.root = createStorage();
    await runPlugin();

    // The app's own plugin runs after the module's, in the same tick.
    runtime.root.mount("mapo-ai", memoryDriver());
    await sealExpiring(runtime.root, "old", 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(errors).not.toHaveBeenCalled();
    expect(await runtime.root.getKeys("mapo-ai")).toEqual([]);
  });

  it("sweeps every hour a driver mounted after the start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.root = createStorage();
    await runPlugin();
    await vi.advanceTimersByTimeAsync(0);

    // An app plugin that waited for a password mounts its driver later.
    runtime.root.mount("mapo-ai", memoryDriver());
    await sealExpiring(runtime.root, "old", 0);
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(await runtime.root.getKeys("mapo-ai")).toEqual([]);
  });

  it("says in the log what keeps the storage closed, without the secret", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.root = createStorage();
    runtime.config = { mapoAi: { secret: "" } };

    await runPlugin();
    await vi.advanceTimersByTimeAsync(0);

    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("NUXT_MAPO_AI_SECRET is not set");
    expect(lines[1]).toContain('No storage is mounted at "mapo-ai"');
  });

  it("says nothing when the secret and the mount are there", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    runtime.root = mountedRoot();

    await runPlugin();
    await vi.advanceTimersByTimeAsync(0);

    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it("stops its timers when the server closes", async () => {
    runtime.root = mountedRoot();
    const hooks = await runPlugin();
    await vi.advanceTimersByTimeAsync(0);

    call(hooks, "close");
    await sealExpiring(runtime.root, "later", 30 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(2 * HOUR);

    expect(await runtime.root.getKeys("mapo-ai")).toEqual([
      "mapo-ai:staging:later.sealed",
    ]);
  });

  it("starts no timer when the server closes before the first tick", async () => {
    runtime.root = mountedRoot();
    await sealExpiring(runtime.root, "old", 0);
    const hooks = await runPlugin();

    call(hooks, "close");
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(await runtime.root.getKeys("mapo-ai")).toHaveLength(1);
  });

  it("never throws where a timer is not allowed at startup, and checks on the first request", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("setTimeout", () => {
      throw new Error("Disallowed operation called within global scope");
    });
    runtime.root = mountedRoot();
    runtime.config = { mapoAi: {} };

    const hooks = await runPlugin();
    expect(errors).not.toHaveBeenCalled();

    call(hooks, "request");
    call(hooks, "request");

    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]?.[0])).toContain(
      "NUXT_MAPO_AI_SECRET is not set",
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapoAiProvider } from "../runtime/server/providers/types";

/** What the mocked `nitropack/runtime` serves: the runtime config. */
const runtime = vi.hoisted(() => {
  const state: { config: Record<string, unknown> } = { config: {} };
  return state;
});

vi.mock("nitropack/runtime", () => ({
  defineNitroPlugin: (plugin: unknown) => plugin,
  useRuntimeConfig: () => runtime.config,
  useNitroApp: () => ({ hooks: { callHook: async () => undefined } }),
  useStorage: () => {
    throw new Error("No storage in this test");
  },
}));

/** The hooks a fake Nitro app collects, by name. */
type Hooks = Map<string, Array<(...args: unknown[]) => void>>;

/** Loads a fresh copy of the plugin and runs it on a fake app with only the hooks it uses. */
async function runPlugin(): Promise<Hooks> {
  const hooks: Hooks = new Map();
  const app = {
    hooks: {
      hook: (name: string, fn: (...args: unknown[]) => void) => {
        hooks.set(name, [...(hooks.get(name) ?? []), fn]);
        return () => hooks.set(name, []);
      },
    },
  };
  // Read as unknown: the fake app has only the hooks, not the whole NitroApp.
  const plugin: unknown = (await import("../runtime/server/plugins/providers"))
    .default;
  if (typeof plugin !== "function") throw new Error("Not a plugin");
  plugin(app);
  return hooks;
}

function acme(id = "acme"): MapoAiProvider {
  return {
    id,
    capabilities: {
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    models: ["acme-1"],
    run: async () => ({
      status: "refused",
      refusal: "",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
  };
}

let errors: ReturnType<typeof vi.spyOn>;
let warnings: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  runtime.config = { mapoAi: { providers: {} } };
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function logged(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call: unknown[]) => String(call[0]));
}

describe("the providers plugin", () => {
  it("checks once the app's plugins have run, so it sees the providers they register", async () => {
    runtime.config = { mapoAi: { providers: { acme: {} } } };
    await runPlugin();
    // An app's plugin, after the module's: it registers its provider.
    const { registerMapoAiProvider } =
      await import("../runtime/server/providers/registry");
    registerMapoAiProvider(acme());

    await vi.runAllTimersAsync();

    expect(logged(errors)).toEqual([]);
    expect(logged(warnings)).toEqual([]);
  });

  it("says that a provider the options enable does not exist", async () => {
    runtime.config = { mapoAi: { providers: { acme: {}, openai: {} } } };
    await runPlugin();

    await vi.runAllTimersAsync();

    expect(logged(errors)).toEqual([
      expect.stringContaining(
        'enables "acme", but there is no provider "acme": register it with registerMapoAiProvider()',
      ),
      expect.stringContaining("this version of Mapo has no such provider"),
    ]);
  });

  it("says that a provider has no model to call", async () => {
    runtime.config = { mapoAi: { providers: { mock: { models: [] } } } };
    await runPlugin();

    await vi.runAllTimersAsync();

    expect(logged(errors)).toEqual([
      expect.stringContaining('The provider "mock" has no model to call'),
    ]);
  });

  it("warns about a provider the app registers that the options do not enable", async () => {
    await runPlugin();
    const { registerMapoAiProvider } =
      await import("../runtime/server/providers/registry");
    registerMapoAiProvider(acme("acme-2"));

    await vi.runAllTimersAsync();

    expect(logged(warnings)).toEqual([
      expect.stringContaining(
        '"acme-2" is registered, but mapo.ai.providers does not enable it',
      ),
    ]);
  });

  it("checks at the first request where the runtime allows no timer at start", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(() => {
      throw new Error("No timers at start");
    });
    runtime.config = { mapoAi: { providers: { acme: {} } } };
    const hooks = await runPlugin();

    for (const hook of hooks.get("request") ?? []) hook({});

    expect(logged(errors)).toEqual([
      expect.stringContaining('there is no provider "acme"'),
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapoAiProvider } from "../runtime/server/providers/types";
import { json, recorded, refusedConnection } from "./servers";

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
  vi.unstubAllGlobals();
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
    // An id Mapo keeps for a provider it does not have yet.
    try {
      await enablesAProviderThatDoesNotExist();
    } finally {
      vi.doUnmock("../runtime/server/providers/registry");
    }
  });

  async function enablesAProviderThatDoesNotExist() {
    vi.doMock(
      "../runtime/server/providers/registry",
      async (importOriginal) => {
        const original =
          await importOriginal<
            typeof import("../runtime/server/providers/registry")
          >();
        return {
          ...original,
          MAPO_AI_RESERVED_PROVIDER_IDS: [
            ...original.MAPO_AI_RESERVED_PROVIDER_IDS,
            "planned",
          ],
        };
      },
    );
    runtime.config = { mapoAi: { providers: { acme: {}, planned: {} } } };
    await runPlugin();

    await vi.runAllTimersAsync();

    expect(logged(errors)).toEqual([
      expect.stringContaining(
        'enables "acme", but there is no provider "acme": register it with registerMapoAiProvider()',
      ),
      expect.stringContaining("this version of Mapo has no such provider"),
    ]);
  }

  it("says that a cloud provider has no key, without calling its API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    runtime.config = {
      mapoAi: { providers: { openai: { timeout: 300, apiKey: "" } } },
    };
    await runPlugin();

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(logged(warnings)).toHaveLength(1));

    expect(logged(warnings)[0]).toContain(
      'The models of the provider "openai" could not be read: The provider "openai" has no key: set NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks the models of a cloud provider against those its key may use", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, headers: new Headers(init.headers) });
      return json({
        data: [
          { id: "claude-opus-5-5", max_input_tokens: 1_000_000 },
          { id: "claude-haiku-5-5", max_input_tokens: 1_000_000 },
        ],
        has_more: false,
      });
    });
    runtime.config = {
      mapoAi: {
        providers: { anthropic: { timeout: 300, apiKey: "sk-ant-test" } },
      },
    };
    await runPlugin();

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(logged(warnings)).toHaveLength(1));

    expect(calls.map((call) => call.url)).toEqual([
      "https://api.anthropic.com/v1/models?limit=1000",
    ]);
    expect(calls[0]?.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(logged(warnings)[0]).toContain(
      'The provider "anthropic" does not list "claude-sonnet-5-5"',
    );
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

describe("the providers plugin and the models of a server", () => {
  it("says which models the server does not have, asking it with the provider's key", async () => {
    const asked: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      asked.push({
        url,
        authorization: new Headers(init.headers).get("authorization"),
      });
      return json(recorded("ollama-tags.json"));
    });
    runtime.config = {
      mapoAi: {
        providers: {
          ollama: {
            models: ["gemma4:12b", "llama3.1", "nope:1b"],
            timeout: 600,
            baseURL: "https://ollama.test:11434",
            apiKey: "k-1",
          },
        },
      },
    };
    await runPlugin();

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(logged(warnings)).toHaveLength(1));

    expect(logged(warnings)[0]).toContain(
      'The provider "ollama" does not list "nope:1b", which mapo.ai.providers.ollama.models allows',
    );
    expect(asked).toEqual([
      {
        url: "https://ollama.test:11434/api/tags",
        authorization: "Bearer k-1",
      },
    ]);
    expect(logged(errors)).toEqual([]);
  });

  it("says when a server that lists its models cannot be reached", async () => {
    vi.stubGlobal("fetch", async () => {
      throw refusedConnection();
    });
    runtime.config = {
      mapoAi: {
        providers: {
          ollama: {
            models: ["m"],
            timeout: 600,
            baseURL: "http://ollama.test:11434",
          },
        },
      },
    };
    await runPlugin();

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(logged(warnings)).toHaveLength(1));

    expect(logged(warnings)[0]).toContain(
      'The models of the provider "ollama" could not be read: Ollama at http://ollama.test:11434 cannot be reached (ECONNREFUSED)',
    );
  });

  it("says once that a key goes to another machine over plain http", async () => {
    vi.stubGlobal("fetch", async () => json(recorded("ollama-tags.json")));
    runtime.config = {
      mapoAi: {
        providers: {
          ollama: {
            models: ["gemma4:12b"],
            timeout: 600,
            baseURL: "http://gpu.lan:11434",
            apiKey: "k-1",
          },
        },
      },
    };
    await runPlugin();

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(logged(warnings)).toHaveLength(1));

    expect(logged(warnings)[0]).toContain(
      'The provider "ollama" sends its key to gpu.lan:11434 over plain http',
    );
    expect(logged(warnings).join(" ")).not.toContain("k-1");
  });

  it("reads only the ids an app's provider lists", async () => {
    runtime.config = {
      mapoAi: { providers: { acme: { models: ["a", "b"] } } },
    };
    await runPlugin();
    const { registerMapoAiProvider } =
      await import("../runtime/server/providers/registry");
    registerMapoAiProvider({
      ...acme(),
      listModels: async () => JSON.parse('[{ "id": "a" }, "b", { "id": 3 }]'),
    });

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(logged(warnings)).toHaveLength(1));

    expect(logged(warnings)[0]).toContain(
      'The provider "acme" does not list "b"',
    );
  });
});

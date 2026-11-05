import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapoAiProvider } from "../runtime/server/providers/types";

async function registry() {
  return import("../runtime/server/providers/registry");
}

function provider(id: string): MapoAiProvider {
  return {
    id,
    capabilities: {
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    run: async () => ({
      status: "refused",
      refusal: "",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("registerMapoAiProvider", () => {
  it("makes a provider of the app available by its id", async () => {
    const {
      mapoAiProvider,
      registerMapoAiProvider,
      registeredMapoAiProviders,
    } = await registry();
    const acme = provider("acme-2");

    registerMapoAiProvider(acme);

    expect(mapoAiProvider("acme-2")).toBe(acme);
    expect(registeredMapoAiProviders()).toEqual(["acme-2"]);
  });

  it("has Mapo's mock without a registration", async () => {
    const { mapoAiProvider } = await registry();

    expect(mapoAiProvider("mock")?.label).toBe("Mock");
    expect(mapoAiProvider("acme")).toBeUndefined();
  });

  it("builds Mapo's providers that call a server, with their address", async () => {
    const { mapoAiProvider } = await registry();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify({ models: [], data: [] }));
    });
    const signal = new AbortController().signal;

    try {
      await mapoAiProvider("ollama")?.listModels?.(signal);
      await mapoAiProvider("ollama", {
        baseURL: "http://gpu.local:11434",
      })?.listModels?.(signal);
      await mapoAiProvider("openai-compatible", {
        baseURL: "http://llm.local:8000/v1",
      })?.listModels?.(signal);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(asked).toEqual([
      "http://localhost:11434/api/tags",
      "http://gpu.local:11434/api/tags",
      "http://llm.local:8000/v1/models",
    ]);
    expect(mapoAiProvider("openai-compatible")).toBeUndefined();
  });

  it("builds the cloud providers at their own address, or the app's, with their key", async () => {
    const { mapoAiProvider } = await registry();
    const asked: { url: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      asked.push({ url, headers: new Headers(init.headers) });
      return new Response(JSON.stringify({ data: [] }));
    });
    const signal = new AbortController().signal;

    try {
      await mapoAiProvider("openai", { apiKey: "sk-1" })?.listModels?.(signal);
      await mapoAiProvider("openai", {
        baseURL: "https://eu.api.openai.com/v1",
        apiKey: "sk-2",
      })?.listModels?.(signal);
      await mapoAiProvider("anthropic", { apiKey: "sk-ant-3" })?.listModels?.(
        signal,
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(asked.map((call) => call.url)).toEqual([
      "https://api.openai.com/v1/models",
      "https://eu.api.openai.com/v1/models",
      "https://api.anthropic.com/v1/models?limit=1000",
    ]);
    expect(asked[0]?.headers.get("authorization")).toBe("Bearer sk-1");
    expect(asked[2]?.headers.get("x-api-key")).toBe("sk-ant-3");
    expect(mapoAiProvider("openai")?.models).toEqual([
      "gpt-6.1-sol",
      "gpt-6-luna",
    ]);
    expect(mapoAiProvider("anthropic")?.label).toBe("Anthropic");
  });

  it("builds the cloud providers with the effort and the prompt cache of their settings", async () => {
    const { mapoAiProvider } = await registry();
    const { documented, providerRequest } = await import("./servers");
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      const name = url.endsWith("/responses")
        ? "openai-answered.sse"
        : "anthropic-answered.sse";
      return new Response(documented(name), {
        headers: { "content-type": "text/event-stream" },
      });
    });
    const settings = {
      apiKey: "sk-1",
      effort: "high" as const,
      promptCache: true,
    };

    try {
      await mapoAiProvider("openai", settings)?.run(
        providerRequest({ model: "gpt-6.1-sol" }),
      );
      await mapoAiProvider("anthropic", settings)?.run(
        providerRequest({ model: "claude-opus-5-5" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(bodies[0]).toMatchObject({
      reasoning: { effort: "high" },
      input: [
        { content: [{ prompt_cache_breakpoint: { mode: "explicit" } }] },
        { role: "user" },
      ],
    });
    expect(bodies[1]).toMatchObject({
      output_config: { effort: "high" },
      system: [{ cache_control: { type: "ephemeral" } }],
    });
  });

  it.each(["mock", "openai", "anthropic", "openai-compatible", "ollama"])(
    "refuses the id of a Mapo provider, %s",
    async (id) => {
      const { registerMapoAiProvider } = await registry();

      expect(() => registerMapoAiProvider(provider(id))).toThrow(
        "id of a Mapo provider",
      );
    },
  );

  it.each(["Acme", "1acme", "acme_1", "", "a".repeat(65), "__proto__"])(
    "refuses an id that is no provider's: %j",
    async (id) => {
      const { registerMapoAiProvider } = await registry();

      expect(() => registerMapoAiProvider(provider(id))).toThrow(TypeError);
    },
  );

  it("refuses an id registered already, and a provider without run()", async () => {
    const { registerMapoAiProvider } = await registry();
    registerMapoAiProvider(provider("acme"));

    expect(() => registerMapoAiProvider(provider("acme"))).toThrow(
      "registered already",
    );
    expect(() =>
      registerMapoAiProvider({ ...provider("other"), run: undefined } as never),
    ).toThrow(TypeError);
  });
});

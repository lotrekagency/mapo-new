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

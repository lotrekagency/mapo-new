import { describe, expect, it } from "vitest";
import type { MapoAiProvider } from "../runtime/server/providers/types";
import { readRunOptions } from "../runtime/server/run/options";
import {
  chooseProvider,
  policyOf,
  providerStatuses,
} from "../runtime/server/run/policy";

function provider(id: string, models?: string[]): MapoAiProvider {
  return {
    id,
    label: id.toUpperCase(),
    capabilities: {
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    ...(models ? { models } : {}),
    run: async () => ({
      status: "refused",
      refusal: "",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
  };
}

const PROVIDERS = new Map([
  ["mock", provider("mock", ["mock"])],
  ["acme", provider("acme", ["acme-1", "acme-2"])],
  ["bare", provider("bare")],
]);

function policy(options: Record<string, unknown>) {
  const warnings: string[] = [];
  const read = readRunOptions(options, (message) => warnings.push(message));
  return { ...policyOf(read, (id) => PROVIDERS.get(id)), warnings };
}

/** The status of a refused choice, or `undefined` when it is allowed. */
function refusal(run: () => unknown): number | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode;
  }
}

describe("policyOf", () => {
  it("keeps the providers the options enable and that exist, in their order", () => {
    const { policy: read, unusable } = policy({
      providers: { acme: {}, mock: {}, nowhere: {} },
    });

    expect(read.providers.map(({ provider: one }) => one.id)).toEqual([
      "acme",
      "mock",
    ]);
    expect(unusable).toEqual([{ id: "nowhere", reason: "unknown" }]);
  });

  it("takes a provider's own models when the options list none, and its timeout in milliseconds", () => {
    const { policy: read } = policy({ providers: { acme: { timeout: 7 } } });

    expect(read.providers[0]).toMatchObject({
      models: ["acme-1", "acme-2"],
      timeoutMs: 7000,
    });
  });

  it("leaves out a provider with no model to call", () => {
    const { policy: read, unusable } = policy({
      providers: { bare: {}, acme: { models: [] } },
    });

    expect(read.providers).toEqual([]);
    expect(read.defaults).toBeUndefined();
    expect(unusable).toEqual([
      { id: "bare", reason: "no-model" },
      { id: "acme", reason: "no-model" },
    ]);
  });

  it("makes the first provider and its first model the default when the options name none", () => {
    const { policy: read } = policy({ providers: { acme: {}, mock: {} } });

    expect(read.defaults).toEqual({
      provider: "acme",
      models: { fill: "acme-1", extract: "acme-1" },
    });
  });

  it("follows mapo.ai.default among the enabled providers and models", () => {
    const { policy: read } = policy({
      providers: { acme: {}, mock: {} },
      default: { provider: "mock" },
    });
    const { policy: withModels } = policy({
      providers: { acme: {} },
      default: { provider: "acme", models: { extract: "acme-2" } },
    });

    expect(read.defaults?.provider).toBe("mock");
    expect(withModels.defaults).toEqual({
      provider: "acme",
      models: { fill: "acme-1", extract: "acme-2" },
    });
  });

  it("falls back to the first provider when the default one is not enabled, and to the first model when its model is not", () => {
    const { policy: read } = policy({
      providers: { acme: {} },
      default: { provider: "mock", models: { fill: "mock" } },
    });
    const { policy: badModel } = policy({
      providers: { acme: {} },
      default: { provider: "acme", models: { fill: "acme-9" } },
    });

    expect(read.defaults).toEqual({
      provider: "acme",
      models: { fill: "acme-1", extract: "acme-1" },
    });
    expect(badModel.defaults?.models.fill).toBe("acme-1");
  });

  it("lists the usable providers for status", () => {
    const { policy: read } = policy({
      providers: { acme: { models: ["acme-2"] } },
    });

    expect(providerStatuses(read)).toEqual([
      { id: "acme", label: "ACME", models: ["acme-2"] },
    ]);
  });
});

describe("chooseProvider", () => {
  const { policy: read } = policy({
    providers: { acme: {}, mock: {} },
    default: { provider: "acme", models: { extract: "acme-2" } },
  });

  it("gives a request that names nothing the default of its task", () => {
    expect(chooseProvider(read, "fill", undefined).model).toBe("acme-1");
    expect(chooseProvider(read, "extract", undefined).model).toBe("acme-2");
  });

  it("gives a request that names another provider its first model", () => {
    const chosen = chooseProvider(read, "extract", { id: "mock" });

    expect(chosen.usable.provider.id).toBe("mock");
    expect(chosen.model).toBe("mock");
  });

  it("gives a request the model it names, among the provider's", () => {
    expect(
      chooseProvider(read, "fill", { id: "acme", model: "acme-2" }).model,
    ).toBe("acme-2");
  });

  it("refuses with 403 a provider or a model the app does not enable", () => {
    expect(refusal(() => chooseProvider(read, "fill", { id: "bare" }))).toBe(
      403,
    );
    expect(
      refusal(() =>
        chooseProvider(read, "fill", { id: "mock", model: "acme-1" }),
      ),
    ).toBe(403);
  });

  it("refuses with 503 when no provider is usable", () => {
    const { policy: none } = policy({});

    expect(refusal(() => chooseProvider(none, "fill", undefined))).toBe(503);
  });
});

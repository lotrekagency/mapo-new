import { describe, expect, it, vi } from "vitest";
import type {
  MapoAiKeyStatus,
  MapoAiPreference,
} from "../runtime/shared/gateway";
import { preferenceApplies, principalsOf } from "../runtime/shared/settings";
import { checkConnection } from "../runtime/server/settings/connection";
import { readRunOptions } from "../runtime/server/run/options";
import { policyForUser, policyOf } from "../runtime/server/run/policy";
import type { UsableProvider } from "../runtime/server/run/policy";
import { MapoAiProviderError } from "../runtime/server/providers/types";
import type { MapoAiProvider } from "../runtime/server/providers/types";

const KEY: MapoAiKeyStatus = {
  level: "group",
  group: "editors",
  last4: "EDT1",
  required: true,
  personal: { allowed: false, saved: false },
};

function provider(extra: Partial<MapoAiProvider> = {}): MapoAiProvider {
  return {
    id: "acme",
    key: "required",
    capabilities: {
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    models: ["acme-1", "acme-2"],
    run: async () => {
      throw new Error("not called");
    },
    ...extra,
  };
}

function usable(extra: Partial<UsableProvider> = {}): UsableProvider {
  return {
    provider: provider(),
    models: ["acme-1", "acme-2"],
    timeoutMs: 5000,
    apiKey: "acme-group-key-0000000000000EDT1",
    key: KEY,
    ...extra,
  };
}

describe("the users and groups of the backend", () => {
  it("reads users by id, named by username, else email, else their name", () => {
    expect(
      principalsOf(
        [
          { id: 1, username: "admin", email: "admin@example.com" },
          { id: "2", email: "editor@example.com" },
          { id: 3, first_name: "Ada", last_name: "Lovelace" },
          { id: 4 },
          { username: "no id" },
          "not a user",
        ],
        "user",
      ),
    ).toEqual([
      { value: "1", label: "admin" },
      { value: "2", label: "editor@example.com" },
      { value: "3", label: "Ada Lovelace" },
      { value: "4", label: "4" },
    ]);
  });

  it("reads a paginated answer, and groups by their name", () => {
    expect(
      principalsOf(
        { count: 2, results: [{ id: 7, name: "editors" }, { id: 8 }] },
        "group",
      ),
    ).toEqual([{ value: "editors", label: "editors" }]);
    expect(principalsOf({ detail: "Not found." }, "user")).toEqual([]);
  });

  it("reads 50 at most", () => {
    const many = Array.from({ length: 80 }, (_, index) => ({ id: index }));

    expect(principalsOf(many, "user")).toHaveLength(50);
  });
});

describe("the check of a connection", () => {
  it("lists the models with the user's key, and times the answer", async () => {
    const listModels = vi.fn(async () => [{ id: "acme-1" }, { id: "acme-2" }]);
    const clock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1320);

    const result = await checkConnection(
      usable({ provider: provider({ listModels }) }),
      "acme-2",
      { now: clock },
    );

    expect(result).toEqual({
      provider: "acme",
      model: "acme-2",
      outcome: "connected",
      latencyMs: 320,
    });
    expect(listModels).toHaveBeenCalledWith(
      expect.any(AbortSignal),
      "acme-group-key-0000000000000EDT1",
    );
  });

  it("says when the server does not list the model", async () => {
    const result = await checkConnection(
      usable({ provider: provider({ listModels: async () => [{ id: "x" }] }) }),
      "acme-1",
    );

    expect(result.outcome).toBe("model-missing");
  });

  it("calls nothing for a provider with no key, or one that cannot list its models", async () => {
    const listModels = vi.fn(async () => []);

    const noKey = await checkConnection(
      usable({
        provider: provider({ listModels }),
        key: { ...KEY, level: "none" },
      }),
      "acme-1",
    );
    const unverifiable = await checkConnection(usable(), "acme-1");

    expect(noKey.outcome).toBe("no-key");
    expect(unverifiable.outcome).toBe("unverifiable");
    expect(listModels).not.toHaveBeenCalled();
  });

  it("names how a failed check failed, and logs why, never the key", async () => {
    const log = vi.fn();
    const refused = await checkConnection(
      usable({
        provider: provider({
          listModels: async () => {
            throw new MapoAiProviderError("rate-limit", "Acme is busy");
          },
        }),
      }),
      "acme-1",
      { log },
    );
    const broken = await checkConnection(
      usable({
        provider: provider({
          listModels: async () => {
            throw new TypeError("fetch failed");
          },
        }),
      }),
      "acme-1",
      { log },
    );

    expect(refused).toEqual({
      provider: "acme",
      model: "acme-1",
      outcome: "failed",
      failure: "rate-limit",
    });
    expect(broken.failure).toBe("unavailable");
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("EDT1");
  });

  it("masks the user's key, and what looks like a key, when a provider repeats it", async () => {
    const log = vi.fn();
    const repeating = (message: string) =>
      checkConnection(
        usable({
          provider: provider({
            listModels: async () => {
              throw new MapoAiProviderError("refused-request", message);
            },
          }),
        }),
        "acme-1",
        { log },
      );

    await repeating("Acme refused the key acme-group-key-0000000000000EDT1");
    await repeating("Proxy refused Bearer acme-group-key-0000000000000EDT1");
    await repeating("OpenAI refused sk-proj-abcdefgh1234");

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("EDT1");
    expect(logged).not.toContain("abcdefgh");
    expect(logged.match(/\[a key\]/g)).toHaveLength(3);
  });
});

describe("the user's preference", () => {
  const options = readRunOptions(
    {
      providers: { acme: { models: ["acme-1", "acme-2"] }, mock: {} },
      default: { provider: "mock" },
    },
    () => undefined,
  );
  const base = policyOf(options, (id) =>
    id === "acme"
      ? provider()
      : provider({ id: "mock", key: undefined, models: ["mock"] }),
  ).policy;
  const offer = (models: string[], key?: MapoAiKeyStatus) =>
    policyForUser(
      base,
      (one) =>
        one.provider.id === "acme"
          ? { provider: one.provider, models, ...(key ? { key } : {}) }
          : { provider: one.provider, models: one.models },
      { provider: "acme", model: "acme-2" } satisfies MapoAiPreference,
    );

  it("becomes the user's default for every task while they may call it", () => {
    expect(offer(["acme-1", "acme-2"], KEY).defaults).toEqual({
      provider: "acme",
      models: { fill: "acme-2", extract: "acme-2" },
    });
  });

  it("gives way to the app's default when the model is closed to them, or no key reaches them", () => {
    const appDefault = {
      provider: "mock",
      models: { fill: "mock", extract: "mock" },
    };

    expect(offer(["acme-1"], KEY).defaults).toEqual(appDefault);
    expect(
      offer(["acme-1", "acme-2"], { ...KEY, level: "none" }).defaults,
    ).toEqual(appDefault);
  });
});

describe("whether the preference applies, as the page reads status", () => {
  const preference = { provider: "acme", model: "acme-2" };

  it("applies when status makes it the default", () => {
    expect(
      preferenceApplies({
        preference,
        default: {
          provider: "acme",
          models: { fill: "acme-2", extract: "acme-2" },
        },
      }),
    ).toBe(true);
  });

  it("does not when the app's default stands in for it, or there is none", () => {
    const appDefault = {
      provider: "mock",
      models: { fill: "mock", extract: "mock" },
    };

    expect(preferenceApplies({ preference, default: appDefault })).toBe(false);
    expect(preferenceApplies({ preference })).toBe(false);
    expect(preferenceApplies({ default: appDefault })).toBe(false);
  });
});

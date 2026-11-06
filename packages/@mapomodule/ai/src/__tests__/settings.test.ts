import { describe, expect, it, vi } from "vitest";
import type {
  MapoAiKeyStatus,
  MapoAiPreference,
} from "../runtime/shared/gateway";
import {
  looserRules,
  preferenceApplies,
  principalsOf,
} from "../runtime/shared/settings";
import {
  emptyAdminSettings,
  modelsToCheck,
  readAdminSettingsRecord,
  readSettingsInput,
  settingsAnswer,
  withAdminSettings,
  withSettingsInput,
} from "../runtime/server/settings/admin";
import { DEFAULT_VERIFICATION_RULES } from "../runtime/shared/sanitize";
import { readAdminSettings } from "../runtime/server/settings/store";
import { readKeys } from "../runtime/server/keys/store";
import { emptyKeysRecord } from "../runtime/server/keys/assignments";
import type { PurposeStore } from "../runtime/server/storage/sealed";
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

describe("the admins' settings of how the AI works", () => {
  const app = readRunOptions(
    {
      providers: {
        acme: { models: ["acme-1"], adminModels: true },
        openai: { promptCache: true },
        anthropic: { fallbacks: false },
        mock: {},
      },
      instructions: { all: "Prices are in euros." },
      secretWords: ["vault"],
      verification: { bareHours: true },
    },
    () => undefined,
  );
  const by = { id: "1", username: "admin" };
  const at = "2026-11-06T10:00:00.000Z";

  it("tells the rules set less prudent than Mapo's defaults, unless told other baselines", () => {
    expect(
      looserRules({
        dateYear: false,
        bareHours: true,
        oneWordQuotes: "never",
        soleNumber: true,
      }),
    ).toEqual(["dateYear", "bareHours"]);
    expect(looserRules({ oneWordQuotes: "unique" })).toEqual([]);
  });

  it("tells a rule set back from a stricter one of the app's as less prudent too", () => {
    const strictApp = {
      ...DEFAULT_VERIFICATION_RULES,
      oneWordQuotes: "never" as const,
      bareHours: false,
    };

    expect(
      looserRules({ oneWordQuotes: "unique", bareHours: false }, [
        DEFAULT_VERIFICATION_RULES,
        strictApp,
      ]),
    ).toEqual(["oneWordQuotes"]);
  });

  it("names in a change the rules it makes less prudent than the app's", () => {
    const strict = readRunOptions(
      { verification: { oneWordQuotes: "never" } },
      () => undefined,
    );

    const change = withSettingsInput(
      emptyAdminSettings(),
      { verification: { oneWordQuotes: "unique" } },
      strict,
      { at, by },
    );

    expect(change.loosened).toEqual(["oneWordQuotes"]);
  });

  it("reads a change block by block, words lowercase and once each", () => {
    expect(
      readSettingsInput({
        secretWords: ["Card Number", "card number", "iban"],
        verification: { soleNumber: false },
      }),
    ).toEqual({
      secretWords: ["card number", "iban"],
      verification: { soleNumber: false },
    });
  });

  it("refuses a change it cannot read, naming where, never what it wrote", () => {
    const refusal = (body: unknown) => {
      try {
        readSettingsInput(body);
      } catch (error) {
        return error as { statusCode: number; data: { path: string } };
      }
      throw new Error("not refused");
    };

    expect(refusal({ secretWords: ["ok", "no!"] }).data.path).toBe(
      "secretWords.1",
    );
    expect(refusal({ verification: { years: true } }).statusCode).toBe(400);
    expect(
      refusal({ instructions: { all: "x".repeat(4001) } }).statusCode,
    ).toBe(400);
    expect(refusal({ providers: { Acme: {} } }).statusCode).toBe(400);
  });

  it("applies a change where the app allows it, and names the blocks and the looser rules", () => {
    const change = withSettingsInput(
      emptyAdminSettings(),
      readSettingsInput({
        instructions: { all: "  Write dates in Italian.  " },
        verification: { dateYear: false },
        providers: {
          acme: { models: ["acme-9", "acme-9"] },
          openai: { promptCache: false },
          anthropic: { fallbacks: false },
        },
      }),
      app,
      { at, by },
    );

    expect(change.blocks).toEqual([
      "instructions",
      "verification",
      "providers",
    ]);
    expect(change.loosened).toEqual(["dateYear"]);
    expect(change.providers).toEqual(["acme", "openai", "anthropic"]);
    expect(change.record.instructions).toEqual({
      all: "Write dates in Italian.",
      fill: "",
      extract: "",
    });
    expect(change.record.providers).toEqual({
      acme: { models: ["acme-9"] },
      openai: { promptCache: false },
      anthropic: { fallbacks: false },
    });
    expect(change.record.updated).toEqual({ at, by });
    expect(readAdminSettingsRecord(change.record)).toEqual(change.record);
  });

  it("refuses what the app keeps from the admins", () => {
    const status = (input: unknown) => {
      try {
        withSettingsInput(emptyAdminSettings(), readSettingsInput(input), app, {
          at,
          by,
        });
      } catch (error) {
        return (error as { statusCode: number }).statusCode;
      }
      return 200;
    };

    // Anthropic's fallbacks on where the app turns them off.
    expect(status({ providers: { anthropic: { fallbacks: true } } })).toBe(403);
    // A model added where the app allows none.
    expect(status({ providers: { openai: { models: ["gpt-x"] } } })).toBe(403);
    // A setting the provider does not take, or a provider the app does not enable.
    expect(status({ providers: { acme: { promptCache: true } } })).toBe(400);
    expect(status({ providers: { openai: { fallbacks: false } } })).toBe(400);
    expect(status({ providers: { ollama: {} } })).toBe(400);
  });

  it("drops a provider's settings when a change leaves them all to the app", () => {
    const saved = {
      ...emptyAdminSettings(),
      providers: { openai: { promptCache: false } },
    };

    const change = withSettingsInput(
      saved,
      { providers: { openai: {} } },
      app,
      { at, by },
    );

    expect(change.record.providers).toEqual({});
  });

  it("asks the server only about the models not saved yet", () => {
    const saved = {
      ...emptyAdminSettings(),
      providers: { acme: { models: ["acme-9"] } },
    };

    expect(
      modelsToCheck(saved, {
        providers: { acme: { models: ["acme-9", "acme-10"] }, openai: {} },
      }),
    ).toEqual(new Map([["acme", ["acme-10"]]]));
  });

  it("applies the record over the app's options, within what the app allows", () => {
    const record = {
      ...emptyAdminSettings(),
      instructions: { all: "Write dates in Italian.", fill: "", extract: "" },
      verification: { soleNumber: false },
      secretWords: ["iban", "vault"],
      providers: {
        acme: { models: ["acme-9"] },
        openai: { promptCache: false, models: ["gpt-x"] },
        anthropic: { fallbacks: true },
      },
    };

    const options = withAdminSettings(app, record);

    expect(options.adminInstructions).toEqual(record.instructions);
    expect(options.instructions.all).toBe("Prices are in euros.");
    expect(options.verification).toEqual({
      ...DEFAULT_VERIFICATION_RULES,
      bareHours: true,
      soleNumber: false,
    });
    expect(options.secretWords).toEqual(["vault", "iban"]);
    expect(options.providers.acme?.addedModels).toEqual(["acme-9"]);
    // Where the app allows no added model, those saved do not apply.
    expect(options.providers.openai?.addedModels).toBeUndefined();
    expect(options.providers.openai?.promptCache).toBe(false);
    // On only where both leave them on.
    expect(options.providers.anthropic?.fallbacks).toBe(false);
  });

  it("answers the settings beside the app's and Mapo's", () => {
    const record = {
      ...emptyAdminSettings(),
      verification: { dateYear: false },
      providers: { openai: { promptCache: false } },
      updated: { at, by },
    };

    const answer = settingsAnswer(app, record, [
      { id: "acme", label: "Acme", models: ["acme-1"] },
      { id: "openai", label: "OpenAI", models: ["gpt-6.1-sol"] },
      { id: "anthropic", label: "Anthropic", models: ["claude-opus-5-5"] },
    ]);

    expect(answer.verification.rules).toMatchObject({
      dateYear: false,
      bareHours: true,
    });
    expect(answer.verification.mapo).toEqual(DEFAULT_VERIFICATION_RULES);
    expect(answer.secretWords.mapo).toContain("credentials");
    expect(answer.secretWords.app).toEqual(["vault"]);
    expect(answer.providers).toEqual([
      {
        id: "acme",
        label: "Acme",
        models: { app: ["acme-1"], added: [], canAdd: true },
      },
      {
        id: "openai",
        label: "OpenAI",
        promptCache: { app: true, admin: false, value: false },
        models: { app: ["gpt-6.1-sol"], added: [], canAdd: false },
      },
      {
        id: "anthropic",
        label: "Anthropic",
        promptCache: { app: false, value: false },
        fallbacks: { app: false, value: false },
        models: { app: ["claude-opus-5-5"], added: [], canAdd: false },
      },
    ]);
    expect(answer.updated).toEqual({ at, by });
  });
});

describe("the records no admin saved yet", () => {
  /** A store whose listing fails: reading a record must not list the purpose. */
  function unlisted(): PurposeStore {
    const records = new Map<string, unknown>();
    const store = {
      get: async <T>(key: string, read: (value: unknown) => T | undefined) =>
        records.has(key) ? read(records.get(key)) : undefined,
      set: async (key: string, value: unknown) => {
        records.set(key, value);
      },
      remove: async (key: string) => {
        records.delete(key);
      },
      has: async (key: string) => records.has(key),
      keys: async (): Promise<string[]> => {
        throw new Error("listed the purpose");
      },
      forUser: async () => store,
    };
    return store;
  }

  it("reads the admins' settings and keys with no listing of the purpose", async () => {
    await expect(readAdminSettings(unlisted())).resolves.toEqual(
      emptyAdminSettings(),
    );
    await expect(readKeys(unlisted())).resolves.toEqual(emptyKeysRecord());
  });
});

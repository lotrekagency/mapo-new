import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecord } from "../runtime/shared/guards";
import { DEFAULT_VERIFICATION_RULES } from "../runtime/shared/sanitize";

/** The options of `run` the module writes when the app sets none of them. */
const RUN_DEFAULTS = {
  providers: {},
  default: { models: {} },
  instructions: { all: "", fill: "", extract: "" },
  verification: { ...DEFAULT_VERIFICATION_RULES },
  limits: {
    perUserPerMinute: 20,
    maxSourceChars: 100_000,
    maxInstructionsChars: 2_000,
  },
  audit: { retentionDays: 90 },
};

/** What the mocked `@nuxt/kit` collects from the module's setup. */
const kit = vi.hoisted(() => {
  const state: {
    handlers: unknown[];
    plugins: unknown[];
    imports: unknown[];
    warnings: unknown[];
    templates: Array<{ template: unknown; context: unknown }>;
    nitro: { options: unknown };
  } = {
    handlers: [],
    plugins: [],
    imports: [],
    warnings: [],
    templates: [],
    nitro: { options: {} },
  };
  return state;
});

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  createResolver: () => ({ resolve: (path: string) => `resolved:${path}` }),
  addServerHandler: (handler: unknown) => kit.handlers.push(handler),
  addServerPlugin: (plugin: unknown) => kit.plugins.push(plugin),
  addServerImports: (imports: unknown[]) => kit.imports.push(...imports),
  addTypeTemplate: (template: unknown, context: unknown) =>
    kit.templates.push({ template, context }),
  useLogger: () => ({ warn: (message: unknown) => kit.warnings.push(message) }),
  useNitro: () => kit.nitro,
}));

/** Runs the module's setup on a fake Nuxt; the hooks it registers, by name. */
async function setup(
  runtimeConfig: Record<string, unknown>,
  options: Record<string, unknown> = {},
): Promise<Map<string, () => void>> {
  const hooks = new Map<string, () => void>();
  const nuxt = {
    options: { runtimeConfig },
    hook: (name: string, fn: () => void) => hooks.set(name, fn),
  };
  const definition: unknown = (await import("../module")).default;
  if (!isRecord(definition) || typeof definition.setup !== "function") {
    throw new Error("No module setup");
  }
  definition.setup(options, nuxt);
  return hooks;
}

beforeEach(() => {
  vi.resetModules();
  kit.handlers = [];
  kit.plugins = [];
  kit.imports = [];
  kit.warnings = [];
  kit.templates = [];
});

describe("the module", () => {
  it("declares the secret empty in the private runtime config, never in the public one", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig);

    expect(runtimeConfig.mapoAi).toEqual({
      secret: "",
      admin: {},
      ...RUN_DEFAULTS,
    });
    expect(runtimeConfig.public).toEqual({});
    expect(kit.warnings).toEqual([]);
  });

  it("keeps a secret written in the Nuxt config, and warns that the build copies it", async () => {
    const written = "a-secret-written-in-the-config-0123456789";
    const runtimeConfig: Record<string, unknown> = {
      public: {},
      mapoAi: { secret: written, other: 1 },
    };

    await setup(runtimeConfig);

    expect(runtimeConfig.mapoAi).toEqual({
      secret: written,
      other: 1,
      admin: {},
      ...RUN_DEFAULTS,
    });
    expect(kit.warnings).toHaveLength(1);
    expect(String(kit.warnings[0])).toContain("NUXT_MAPO_AI_SECRET");
    expect(String(kit.warnings[0])).not.toContain(written);
  });

  it("mounts the default storage once Nuxt is ready", async () => {
    const options = {
      dev: false,
      node: true,
      rootDir: "/srv/app",
      storage: {},
      devStorage: {},
    };
    kit.nitro = { options };

    const hooks = await setup({ public: {} });
    expect(options.storage).toEqual({});
    hooks.get("ready")?.();

    expect(options.storage).toEqual({
      "mapo-ai": { driver: "fsLite", base: "./.data/mapo-ai" },
    });
  });

  it("registers the plugins, the routes and what the app's server code uses without an import", async () => {
    await setup({ public: {} });

    expect(kit.plugins).toEqual([
      "resolved:./runtime/server/plugins/storage",
      "resolved:./runtime/server/plugins/providers",
    ]);
    expect(kit.handlers).toEqual([
      {
        route: "/_mapo/ai/status",
        method: "get",
        handler: "resolved:./runtime/server/routes/status.get",
      },
      {
        route: "/_mapo/ai/run",
        method: "post",
        handler: "resolved:./runtime/server/routes/run.post",
      },
    ]);
    expect(kit.imports).toEqual([
      {
        name: "registerMapoAiProvider",
        from: "resolved:./runtime/server/providers/registry",
      },
      {
        name: "MapoAiProviderError",
        from: "resolved:./runtime/server/providers/types",
      },
      {
        name: "registerMapoAiMockFixtures",
        from: "resolved:./runtime/server/providers/mock",
      },
    ]);
  });

  it("types the mapo-ai:user hook in the app's server code", async () => {
    await setup({ public: {} });

    expect(kit.templates).toHaveLength(1);
    const [{ template, context }] = kit.templates as [
      {
        template: { filename: string; getContents: () => string };
        context: unknown;
      },
    ];
    expect(template.filename).toBe("types/mapo-ai.d.ts");
    expect(template.getContents()).toContain(
      'import "resolved:./runtime/server/auth/hooks";',
    );
    expect(context).toEqual({ nitro: true });
  });
});

describe("the access options", () => {
  it("keeps mapo.ai.admin and mapo.ai.users in the private runtime config", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      admin: { groups: ["ai-admin"] },
      users: { groups: ["editors"], permissions: ["change_article"] },
    });

    expect(runtimeConfig.mapoAi).toEqual({
      secret: "",
      admin: { groups: ["ai-admin"] },
      users: { groups: ["editors"], permissions: ["change_article"] },
      ...RUN_DEFAULTS,
    });
    expect(runtimeConfig.public).toEqual({});
    expect(kit.warnings).toEqual([]);
  });

  it("leaves users out when the app does not set it: everyone signed in may use the AI", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { admin: { permissions: ["change_settings"] } });

    expect(runtimeConfig.mapoAi).not.toHaveProperty("users");
  });

  it.each([
    ["a list", ["editors"]],
    ["a string", "editors"],
    ["true", true],
  ])(
    "narrows users written as %s to superusers and admins, and warns",
    async (_case, users) => {
      const runtimeConfig: Record<string, unknown> = { public: {} };

      await setup(runtimeConfig, { users });

      expect(runtimeConfig.mapoAi).toMatchObject({ users: {} });
      expect(kit.warnings).toHaveLength(1);
      expect(String(kit.warnings[0])).toContain("mapo.ai.users");
    },
  );

  it("warns about a key that picks nobody, and about names that are not text", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      admin: { group: ["ai-admin"], groups: ["ai-admin", 3, ""] },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      admin: { groups: ["ai-admin"] },
    });
    expect(kit.warnings).toHaveLength(2);
    expect(String(kit.warnings[0])).toContain('"group"');
    expect(String(kit.warnings[1])).toContain("mapo.ai.admin.groups");
  });

  it("warns that a users rule with no group and no permission lets only admins in", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { users: { groups: [] } });

    expect(kit.warnings).toHaveLength(1);
    expect(String(kit.warnings[0])).toContain("Leave it unset");
  });

  it("reads groups that are no list as none", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { admin: { groups: "ai-admin" } });

    expect(runtimeConfig.mapoAi).toMatchObject({ admin: { groups: [] } });
    expect(kit.warnings).toHaveLength(1);
  });
});

describe("the options of run", () => {
  it("keeps them, complete, in the private runtime config", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: { mock: { models: ["mock", "mock-large"], timeout: 30 } },
      default: { provider: "mock", models: { fill: "mock-large" } },
      instructions: { all: "Prices are in euros." },
      verification: { bareHours: true },
      limits: { perUserPerMinute: 5 },
      audit: { retentionDays: 30 },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { mock: { models: ["mock", "mock-large"], timeout: 30 } },
      default: { provider: "mock", models: { fill: "mock-large" } },
      instructions: { all: "Prices are in euros.", fill: "", extract: "" },
      verification: { ...DEFAULT_VERIFICATION_RULES, bareHours: true },
      limits: {
        perUserPerMinute: 5,
        maxSourceChars: 100_000,
        maxInstructionsChars: 2_000,
      },
      audit: { retentionDays: 30 },
    });
    expect(runtimeConfig.public).toEqual({});
    expect(kit.warnings).toEqual([]);
  });

  it("gives a provider without a timeout the default one, and leaves its models to it", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { providers: { mock: {} } });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { mock: { timeout: 120 } },
    });
    expect(
      (runtimeConfig.mapoAi as { providers: { mock: object } }).providers.mock,
    ).not.toHaveProperty("models");
  });

  it("leaves out a provider turned off with false", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { providers: { mock: false } });

    expect(runtimeConfig.mapoAi).toMatchObject({ providers: {} });
    expect(kit.warnings).toEqual([]);
  });

  it.each([
    [
      "providers that are no object",
      { providers: ["mock"] },
      "mapo.ai.providers",
    ],
    [
      "a provider that is no object",
      { providers: { mock: true } },
      "mapo.ai.providers.mock",
    ],
    [
      "an id that is no provider's",
      { providers: { Mock_1: {} } },
      "mapo.ai.providers.Mock_1",
    ],
    [
      "models that are no list",
      { providers: { mock: { models: "mock" } } },
      "mapo.ai.providers.mock.models",
    ],
    [
      "a timeout that is no number of seconds",
      { providers: { mock: { timeout: 0 } } },
      "mapo.ai.providers.mock.timeout",
    ],
    [
      "a key a provider does not have",
      { providers: { mock: { baseURL: "http://x" } } },
      '"baseURL"',
    ],
    [
      "a limit that is no whole number",
      { limits: { perUserPerMinute: 2.5 } },
      "mapo.ai.limits.perUserPerMinute",
    ],
    [
      "a limit below 0",
      { limits: { maxSourceChars: -1 } },
      "mapo.ai.limits.maxSourceChars",
    ],
    [
      "a rule of verification of the wrong type",
      { verification: { dateYear: "yes" } },
      "mapo.ai.verification.dateYear",
    ],
    [
      "a rule of verification that does not exist",
      { verification: { years: true } },
      '"years"',
    ],
    [
      "instructions that are not text",
      { instructions: { all: ["a"] } },
      "mapo.ai.instructions.all",
    ],
    [
      "a retention that is no number of days",
      { audit: { retentionDays: -1 } },
      "mapo.ai.audit.retentionDays",
    ],
  ])("warns about %s", async (_case, options, named) => {
    await setup({ public: {} }, options);

    expect(kit.warnings).toHaveLength(1);
    expect(String(kit.warnings[0])).toContain(named);
  });

  it("enables no provider whose models cannot be read", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { providers: { mock: { models: "mock" } } });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { mock: { models: [] } },
    });
  });

  it("makes a limit it cannot read the narrowest, 0, and keeps the default of a rule it cannot read", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      limits: { perUserPerMinute: "many", maxInstructionsChars: -1 },
      verification: { oneWordQuotes: "always", timeZones: false },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      limits: {
        perUserPerMinute: 0,
        maxSourceChars: 100_000,
        maxInstructionsChars: 0,
      },
      verification: { oneWordQuotes: "unique", timeZones: false },
    });
  });

  it("takes 0 as a limit: no call, no source, no instructions", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      limits: {
        perUserPerMinute: 0,
        maxSourceChars: 0,
        maxInstructionsChars: 0,
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      limits: {
        perUserPerMinute: 0,
        maxSourceChars: 0,
        maxInstructionsChars: 0,
      },
    });
    expect(kit.warnings).toEqual([]);
  });

  it("warns that a default provider the app does not enable is not the default", async () => {
    await setup(
      { public: {} },
      { providers: { mock: {} }, default: { provider: "acme" } },
    );

    expect(kit.warnings).toHaveLength(1);
    expect(String(kit.warnings[0])).toContain('"acme"');
  });
});

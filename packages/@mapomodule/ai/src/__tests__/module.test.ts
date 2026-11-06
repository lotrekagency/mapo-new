import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecord } from "../runtime/shared/guards";
import { DEFAULT_VERIFICATION_RULES } from "../runtime/shared/sanitize";

/** Mapo's readers, each on, as the module writes them when the app turns none off. */
const READERS_ON = {
  text: true,
  markdown: true,
  json: true,
  html: true,
  csv: true,
  xlsx: true,
};

/** The options of `run` and `read` the module writes when the app sets none of them. */
const RUN_DEFAULTS = {
  providers: {},
  default: { models: {} },
  instructions: { all: "", fill: "", extract: "" },
  secretWords: [],
  verification: { ...DEFAULT_VERIFICATION_RULES },
  readers: READERS_ON,
  limits: {
    perUserPerMinute: 20,
    maxSourceChars: 100_000,
    maxInstructionsChars: 2_000,
    maxFileBytes: 10 * 1024 * 1024,
  },
  audit: { retentionDays: 90 },
  prices: { currency: "USD", providers: {} },
};

/** What the mocked `@nuxt/kit` collects from the module's setup. */
const kit = vi.hoisted(() => {
  const state: {
    handlers: unknown[];
    plugins: unknown[];
    imports: unknown[];
    appImports: unknown[];
    warnings: unknown[];
    templates: Array<{ template: unknown; context: unknown }>;
    nitro: { options: unknown };
    components: unknown[];
    pages: Array<(pages: Array<Record<string, unknown>>) => void>;
  } = {
    handlers: [],
    plugins: [],
    imports: [],
    appImports: [],
    warnings: [],
    templates: [],
    nitro: { options: {} },
    components: [],
    pages: [],
  };
  return state;
});

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  createResolver: () => ({ resolve: (path: string) => `resolved:${path}` }),
  addServerHandler: (handler: unknown) => kit.handlers.push(handler),
  addServerPlugin: (plugin: unknown) => kit.plugins.push(plugin),
  addServerImports: (imports: unknown[]) => kit.imports.push(...imports),
  addImports: (imports: unknown[]) => kit.appImports.push(...imports),
  addTypeTemplate: (template: unknown, context: unknown) =>
    kit.templates.push({ template, context }),
  useLogger: () => ({ warn: (message: unknown) => kit.warnings.push(message) }),
  useNitro: () => kit.nitro,
  addComponent: (component: unknown) => kit.components.push(component),
  extendPages: (extend: (pages: Array<Record<string, unknown>>) => void) =>
    kit.pages.push(extend),
}));

/** The pages the module adds to an app that has `existing`. */
function pagesAdded(existing: Array<Record<string, unknown>> = []) {
  const pages = [...existing];
  for (const extend of kit.pages) extend(pages);
  return pages.slice(existing.length);
}

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
  kit.appImports = [];
  kit.warnings = [];
  kit.templates = [];
  kit.components = [];
  kit.pages = [];
});

describe("the AI settings page", () => {
  it("adds the page at /ai-settings, in the sidebar's footer, behind the login, with its component", async () => {
    await setup({ public: {} });

    expect(pagesAdded()).toEqual([
      {
        name: "mapo-ai-settings",
        path: "/ai-settings",
        file: "resolved:./runtime/pages/ai-settings.vue",
        meta: {
          layout: "mapo-default",
          middleware: ["auth"],
          label: "AI settings",
          icon: "i-lucide-sparkles",
          sidebarFooter: true,
        },
      },
    ]);
    expect(kit.components).toEqual([
      {
        name: "MapoAiSettings",
        filePath: "resolved:./runtime/components/MapoAiSettings.vue",
      },
    ]);
  });

  it("leaves the path to a page of the app", async () => {
    await setup({ public: {} });

    expect(pagesAdded([{ path: "/ai-settings", file: "app.vue" }])).toEqual([]);
  });

  it("takes another path and label, or no page, and the endpoints of users and groups", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      settings: {
        path: "/settings/ai",
        label: "Impostazioni AI",
        usersApi: "/api/users/",
        groupsApi: "https://backend.example.org/api/groups/",
      },
    });

    expect(pagesAdded()).toMatchObject([
      { path: "/settings/ai", meta: { label: "Impostazioni AI" } },
    ]);
    expect(runtimeConfig.public).toEqual({
      mapoAi: {
        settings: {
          usersApi: "/api/users/",
          groupsApi: "https://backend.example.org/api/groups/",
        },
      },
    });
    expect(kit.warnings).toEqual([]);

    kit.pages = [];
    await setup({ public: {} }, { settings: { path: false } });
    expect(pagesAdded()).toEqual([]);
    expect(kit.components).toHaveLength(2);
  });

  it("keeps the defaults of what it cannot read, and says so", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      settings: {
        path: "ai settings",
        label: "",
        usersApi: "users",
        color: "red",
      },
    });

    expect(pagesAdded()).toMatchObject([
      { path: "/ai-settings", meta: { label: "AI settings" } },
    ]);
    expect(runtimeConfig.public).toEqual({
      mapoAi: { settings: { usersApi: "", groupsApi: "" } },
    });
    expect(kit.warnings.map(String)).toEqual([
      'mapo.ai.settings has no "color": ignored.',
      'mapo.ai.settings.path is not a path such as "/ai-settings", or false, so the page is at /ai-settings.',
      'mapo.ai.settings.label is not a text of up to 80 characters, so the page is "AI settings" in the sidebar.',
      'mapo.ai.settings.usersApi is not a path of the backend such as "/api/users/", so the admins write a user\'s id instead.',
    ]);
  });
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
    // The public runtime config holds the settings page's endpoints only.
    expect(runtimeConfig.public).toEqual({
      mapoAi: { settings: { usersApi: "", groupsApi: "" } },
    });
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
        route: "/_mapo/ai/read",
        method: "post",
        handler: "resolved:./runtime/server/routes/read.post",
      },
      {
        route: "/_mapo/ai/run",
        method: "post",
        handler: "resolved:./runtime/server/routes/run.post",
      },
      {
        route: "/_mapo/ai/keys",
        method: "get",
        handler: "resolved:./runtime/server/routes/keys.get",
      },
      {
        route: "/_mapo/ai/keys",
        method: "put",
        handler: "resolved:./runtime/server/routes/keys.put",
      },
      {
        route: "/_mapo/ai/keys/groups",
        method: "put",
        handler: "resolved:./runtime/server/routes/keys-groups.put",
      },
      {
        route: "/_mapo/ai/keys/:id",
        method: "delete",
        handler: "resolved:./runtime/server/routes/keys-id.delete",
      },
      {
        route: "/_mapo/ai/token",
        method: "put",
        handler: "resolved:./runtime/server/routes/token.put",
      },
      {
        route: "/_mapo/ai/token",
        method: "delete",
        handler: "resolved:./runtime/server/routes/token.delete",
      },
      {
        route: "/_mapo/ai/preferences",
        method: "put",
        handler: "resolved:./runtime/server/routes/preferences.put",
      },
      {
        route: "/_mapo/ai/preferences",
        method: "delete",
        handler: "resolved:./runtime/server/routes/preferences.delete",
      },
      {
        route: "/_mapo/ai/test",
        method: "post",
        handler: "resolved:./runtime/server/routes/test.post",
      },
      {
        route: "/_mapo/ai/settings",
        method: "get",
        handler: "resolved:./runtime/server/routes/settings.get",
      },
      {
        route: "/_mapo/ai/settings",
        method: "put",
        handler: "resolved:./runtime/server/routes/settings.put",
      },
      {
        route: "/_mapo/ai/settings/preview",
        method: "post",
        handler: "resolved:./runtime/server/routes/settings-preview.post",
      },
      {
        route: "/_mapo/ai/usage",
        method: "get",
        handler: "resolved:./runtime/server/routes/usage.get",
      },
      {
        route: "/_mapo/ai/usage/mine",
        method: "get",
        handler: "resolved:./runtime/server/routes/usage-mine.get",
      },
      {
        route: "/_mapo/ai/actions",
        method: "get",
        handler: "resolved:./runtime/server/routes/actions.get",
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
      {
        name: "registerMapoAiReader",
        from: "resolved:./runtime/server/readers/registry",
      },
    ]);
  });

  it("gives the app's pages the composables that fill a detail form and read a file", async () => {
    await setup({ public: {} });

    expect(kit.appImports).toEqual([
      {
        name: "useMapoAiFill",
        from: "resolved:./runtime/composables/useMapoAiFill",
      },
      {
        name: "useMapoAiRead",
        from: "resolved:./runtime/composables/useMapoAiRead",
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
    expect(runtimeConfig.public).toEqual({
      mapoAi: { settings: { usersApi: "", groupsApi: "" } },
    });
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
      verification: { bareHours: true, soleNumber: false },
      limits: { perUserPerMinute: 5 },
      audit: { retentionDays: 30 },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { mock: { models: ["mock", "mock-large"], timeout: 30 } },
      default: { provider: "mock", models: { fill: "mock-large" } },
      instructions: { all: "Prices are in euros.", fill: "", extract: "" },
      verification: {
        ...DEFAULT_VERIFICATION_RULES,
        bareHours: true,
        soleNumber: false,
      },
      limits: {
        perUserPerMinute: 5,
        maxSourceChars: 100_000,
        maxInstructionsChars: 2_000,
        maxFileBytes: 10 * 1024 * 1024,
      },
      audit: { retentionDays: 30 },
    });
    expect(runtimeConfig.public).toEqual({
      mapoAi: { settings: { usersApi: "", groupsApi: "" } },
    });
    expect(kit.warnings).toEqual([]);
  });

  it("gives every reader of Mapo its place, so the environment can turn one off", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      readers: { xlsx: false, ics: true },
      limits: { maxFileBytes: 1024 },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      readers: { ...READERS_ON, xlsx: false, ics: true },
      limits: { maxFileBytes: 1024 },
    });
    expect(kit.warnings).toEqual([]);
  });

  it("turns off a reader whose value cannot be read, and ignores an id that is no reader's", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      readers: { html: "no", "Not An Id": false },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      readers: { ...READERS_ON, html: false },
    });
    expect(kit.warnings).toEqual([
      expect.stringContaining(
        "mapo.ai.readers.html is not true or false, so the reader is off",
      ),
      expect.stringContaining(
        "mapo.ai.readers.Not An Id: a reader's id is lowercase letters",
      ),
    ]);
  });

  it("turns every reader on when mapo.ai.readers cannot be read", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, { readers: ["xlsx"] });

    expect(runtimeConfig.mapoAi).toMatchObject({ readers: READERS_ON });
    expect(kit.warnings).toEqual([
      expect.stringContaining("mapo.ai.readers is not an object of readers"),
    ]);
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

  it("gives the local providers their server, 600 seconds and a place for their key", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: {
        ollama: { models: ["gemma4:12b"] },
        "openai-compatible": {
          models: ["qwen"],
          baseURL: "http://localhost:1234/v1/",
          timeout: 900,
        },
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: {
        ollama: {
          models: ["gemma4:12b"],
          timeout: 600,
          baseURL: "http://localhost:11434",
          apiKey: "",
        },
        "openai-compatible": {
          models: ["qwen"],
          timeout: 900,
          baseURL: "http://localhost:1234/v1",
          apiKey: "",
        },
      },
    });
    expect(kit.warnings).toEqual([]);
  });

  it("gives the cloud providers their address, 300 seconds, a low effort, no cache and a place for their key", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: {
        openai: {},
        anthropic: {
          models: ["claude-sonnet-5-5"],
          baseURL: "https://llm-proxy.example.org/anthropic/v1/",
          effort: "medium",
          promptCache: true,
          timeout: 120,
        },
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: {
        openai: {
          timeout: 300,
          baseURL: "https://api.openai.com/v1",
          effort: "low",
          promptCache: false,
          apiKey: "",
        },
        anthropic: {
          models: ["claude-sonnet-5-5"],
          timeout: 120,
          baseURL: "https://llm-proxy.example.org/anthropic/v1",
          effort: "medium",
          promptCache: true,
          apiKey: "",
        },
      },
    });
    expect(
      (runtimeConfig.mapoAi as { providers: { openai: object } }).providers
        .openai,
    ).not.toHaveProperty("models");
    expect(kit.warnings).toEqual([]);
  });

  it("keeps the low effort and no cache when the app's values cannot be read", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: {
        openai: { effort: "max", promptCache: "yes" },
        ollama: { models: ["x"], effort: "high", promptCache: true },
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { openai: { effort: "low", promptCache: false } },
    });
    expect(
      (runtimeConfig.mapoAi as { providers: { ollama: object } }).providers
        .ollama,
    ).not.toHaveProperty("effort");
    expect(kit.warnings.map(String)).toEqual([
      'mapo.ai.providers.openai.effort is not "low", "medium" or "high", so it is "low".',
      "mapo.ai.providers.openai.promptCache is not true or false, so it is false.",
      'mapo.ai.providers.ollama has no "effort", "promptCache": ignored.',
    ]);
  });

  it("warns that a cloud provider's key written in the Nuxt config goes into the bundle", async () => {
    const written = "sk-written-in-the-config";
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: { anthropic: { apiKey: written } },
    });

    expect(kit.warnings.map(String)).toEqual([
      "mapo.ai.providers.anthropic.apiKey is set in the Nuxt config, so the build copies it into the server bundle. Set NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY in the server's environment instead.",
    ]);
    expect(kit.warnings.join(" ")).not.toContain(written);
  });

  it("enables no local provider without a server it can read", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: {
        "openai-compatible": { models: ["qwen"] },
        ollama: { models: ["x"], baseURL: "http://user:pass@ollama:11434" },
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({ providers: {} });
    expect(kit.warnings.map(String)).toEqual([
      "mapo.ai.providers.openai-compatible has no baseURL, the address of its server, so the provider is not enabled.",
      "mapo.ai.providers.ollama.baseURL is not an http or https address without credentials, query or fragment, so the provider is not enabled.",
    ]);
  });

  it("keeps a key written in the Nuxt config, and warns that the build copies it", async () => {
    const written = "key-written-in-the-config";
    const runtimeConfig: Record<string, unknown> = {
      public: {},
      mapoAi: { providers: { ollama: { apiKey: "in-runtime-config" } } },
    };

    await setup(runtimeConfig, {
      providers: {
        "openai-compatible": {
          models: ["qwen"],
          baseURL: "http://llm:8000/v1",
          apiKey: written,
        },
        ollama: { models: ["x"] },
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: {
        "openai-compatible": { apiKey: written },
        ollama: { apiKey: "in-runtime-config" },
      },
    });
    expect(kit.warnings.map(String)).toEqual([
      "mapo.ai.providers.openai-compatible.apiKey is set in the Nuxt config, so the build copies it into the server bundle. Set NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY in the server's environment instead.",
      "runtimeConfig.mapoAi.providers.ollama.apiKey is set in the Nuxt config, so the build copies it into the server bundle. Set NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY in the server's environment instead.",
    ]);
    expect(kit.warnings.join(" ")).not.toContain(written);
  });

  it("takes the context of an OpenAI-compatible server, and enables none it cannot read", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: {
        "openai-compatible": {
          models: ["qwen"],
          baseURL: "http://llm:8000/v1",
          contextTokens: 16_384,
        },
        ollama: { models: ["x"], contextTokens: 8192 },
      },
    });
    const { warnings: first } = kit;
    const unreadable: Record<string, unknown> = { public: {} };
    kit.warnings = [];
    await setup(unreadable, {
      providers: {
        "openai-compatible": {
          models: ["qwen"],
          baseURL: "http://llm:8000/v1",
          contextTokens: 100,
        },
      },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: {
        "openai-compatible": { contextTokens: 16_384 },
        ollama: { models: ["x"] },
      },
    });
    expect(
      (runtimeConfig.mapoAi as { providers: { ollama: object } }).providers
        .ollama,
    ).not.toHaveProperty("contextTokens");
    expect(first.map(String)).toEqual([
      'mapo.ai.providers.ollama has no "contextTokens": ignored.',
    ]);
    expect(unreadable.mapoAi).toMatchObject({ providers: {} });
    expect(kit.warnings.map(String)).toEqual([
      "mapo.ai.providers.openai-compatible.contextTokens is not a whole number of tokens from 1024 to 10000000, so the provider is not enabled.",
    ]);
  });

  it("gives an app's provider a place for its project's key, which the environment fills", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: { acme: { models: ["acme-1"], baseURL: "http://x" } },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { acme: { models: ["acme-1"], timeout: 120, apiKey: "" } },
    });
    expect(
      (runtimeConfig.mapoAi as { providers: { acme: object } }).providers.acme,
    ).not.toHaveProperty("baseURL");
    expect(kit.warnings.map(String)).toEqual([
      'mapo.ai.providers.acme has no "baseURL": ignored.',
    ]);
  });

  it("warns about the key of an app's provider written in the config", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };
    const written = "acme-key-written-in-the-config";

    await setup(runtimeConfig, {
      providers: { acme: { models: ["acme-1"], apiKey: written } },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { acme: { apiKey: written } },
    });
    expect(kit.warnings.map(String)).toEqual([
      "mapo.ai.providers.acme.apiKey is set in the Nuxt config, so the build copies it into the server bundle. Set NUXT_MAPO_AI_PROVIDERS_ACME_API_KEY in the server's environment instead.",
    ]);
  });

  it("takes no server and no key for a provider that calls none", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig, {
      providers: { mock: { baseURL: "http://x", apiKey: "k" } },
    });

    expect(runtimeConfig.mapoAi).toMatchObject({
      providers: { mock: { timeout: 120 } },
    });
    expect(
      (runtimeConfig.mapoAi as { providers: { mock: object } }).providers.mock,
    ).not.toHaveProperty("apiKey");
    expect(kit.warnings.map(String)).toEqual([
      'mapo.ai.providers.mock has no "baseURL", "apiKey": ignored.',
    ]);
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecord } from "../runtime/shared/guards";

/** What the mocked `@nuxt/kit` collects from the module's setup. */
const kit = vi.hoisted(() => {
  const state: {
    handlers: unknown[];
    plugins: unknown[];
    warnings: unknown[];
    templates: Array<{ template: unknown; context: unknown }>;
    nitro: { options: unknown };
  } = {
    handlers: [],
    plugins: [],
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
  kit.warnings = [];
  kit.templates = [];
});

describe("the module", () => {
  it("declares the secret empty in the private runtime config, never in the public one", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig);

    expect(runtimeConfig.mapoAi).toEqual({ secret: "", admin: {} });
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

  it("registers the storage plugin and the status route", async () => {
    await setup({ public: {} });

    expect(kit.plugins).toEqual(["resolved:./runtime/server/plugins/storage"]);
    expect(kit.handlers).toEqual([
      {
        route: "/_mapo/ai/status",
        method: "get",
        handler: "resolved:./runtime/server/routes/status.get",
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecord } from "../runtime/shared/guards";

/** What the mocked `@nuxt/kit` collects from the module's setup. */
const kit = vi.hoisted(() => {
  const state: {
    handlers: unknown[];
    plugins: unknown[];
    warnings: unknown[];
    nitro: { options: unknown };
  } = { handlers: [], plugins: [], warnings: [], nitro: { options: {} } };
  return state;
});

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  createResolver: () => ({ resolve: (path: string) => `resolved:${path}` }),
  addServerHandler: (handler: unknown) => kit.handlers.push(handler),
  addServerPlugin: (plugin: unknown) => kit.plugins.push(plugin),
  useLogger: () => ({ warn: (message: unknown) => kit.warnings.push(message) }),
  useNitro: () => kit.nitro,
}));

/** Runs the module's setup on a fake Nuxt; the hooks it registers, by name. */
async function setup(
  runtimeConfig: Record<string, unknown>,
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
  definition.setup({}, nuxt);
  return hooks;
}

beforeEach(() => {
  vi.resetModules();
  kit.handlers = [];
  kit.plugins = [];
  kit.warnings = [];
});

describe("the module", () => {
  it("declares the secret empty in the private runtime config, never in the public one", async () => {
    const runtimeConfig: Record<string, unknown> = { public: {} };

    await setup(runtimeConfig);

    expect(runtimeConfig.mapoAi).toEqual({ secret: "" });
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

    expect(runtimeConfig.mapoAi).toEqual({ secret: written, other: 1 });
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
});

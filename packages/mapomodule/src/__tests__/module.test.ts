import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the mocked `@nuxt/kit` collects from the meta-module's setup. */
const kit = vi.hoisted(() => {
  const state: {
    listed: Set<string>;
    installed: Array<{ name: unknown; options: unknown }>;
    warnings: unknown[];
  } = { listed: new Set(), installed: [], warnings: [] };
  return state;
});

vi.mock("@nuxt/kit", () => ({
  defineNuxtModule: (definition: unknown) => definition,
  createResolver: () => ({ resolvePath: async (name: string) => name }),
  hasNuxtModule: (name: string) => kit.listed.has(name),
  installModule: async (name: unknown, options?: unknown) => {
    kit.installed.push({ name, options });
  },
  useLogger: () => ({ warn: (message: unknown) => kit.warnings.push(message) }),
}));

/** Runs the meta-module's setup with `mapo` set to `options`. */
async function setup(options: Record<string, unknown>): Promise<void> {
  const definition: unknown = (await import("../module")).default;
  const hasSetup =
    typeof definition === "object" &&
    definition !== null &&
    "setup" in definition &&
    typeof definition.setup === "function";
  if (!hasSetup) throw new Error("No module setup");
  await (definition.setup as (o: unknown, n: unknown) => Promise<void>)(
    options,
    { options: { dev: false } },
  );
}

function aiInstalls(): unknown[] {
  return kit.installed
    .filter(({ name }) => name === "@mapomodule/ai")
    .map(({ options }) => options);
}

beforeEach(() => {
  vi.resetModules();
  kit.listed = new Set();
  kit.installed = [];
  kit.warnings = [];
});

describe("the meta-module and @mapomodule/ai", () => {
  it("installs ai with the options of mapo.ai", async () => {
    await setup({ ai: { users: { groups: ["editors"] } } });

    expect(aiInstalls()).toEqual([{ users: { groups: ["editors"] } }]);
    expect(kit.warnings).toEqual([]);
  });

  it.each([
    ["without mapo.ai", {}],
    ["with ai: false", { ai: false }],
  ])("installs nothing of ai %s", async (_case, options) => {
    await setup(options);

    expect(aiInstalls()).toEqual([]);
  });

  it("warns when ai is also listed in modules, where the options of mapo.ai never reach it", async () => {
    kit.listed.add("@mapomodule/ai");

    await setup({ ai: { users: { groups: ["editors"] } } });

    expect(aiInstalls()).toEqual([]);
    expect(kit.warnings).toHaveLength(1);
    expect(String(kit.warnings[0])).toContain("mapoAi");
  });

  it("says nothing when ai is listed and mapo.ai holds no option", async () => {
    kit.listed.add("@mapomodule/ai");

    await setup({ ai: {} });

    expect(kit.warnings).toEqual([]);
  });
});

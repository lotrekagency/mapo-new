import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addServerTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  installModule,
  logger,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import type { MapoAppManifest, MapoMcpContext, MapoMcpOptions } from "./index";

export type { MapoAppManifest, MapoMcpContext, MapoMcpOptions } from "./index";

/** Shape of the paths object passed by `@nuxtjs/mcp-toolkit`'s build-time hook. */
interface McpDefinitionPaths {
  tools: string[];
  resources: string[];
  prompts: string[];
  handlers: string[];
}

/**
 * Config keys owned by other modules. They are augmented onto `NuxtOptions`
 * only inside the consuming app's build, so this module reads them structurally.
 */
interface ForeignModuleOptions {
  mapoForm?: { fields?: { mapping?: Record<string, unknown> } };
  i18n?: { locales?: Array<string | { code: string }> };
}

/**
 * Directory name under `runtime/mcp/handlers/`, which the toolkit turns into
 * the handler name and the route segment. It is not configurable: folder
 * handlers always take their name from the directory.
 */
const HANDLER_NAME = "mapo";

/** Reads the default field-type list emitted by the knowledge build, when present. */
function readDefaultFieldTypes(knowledgeDir: string | null): string[] {
  if (!knowledgeDir) return [];
  const file = join(knowledgeDir, "fields.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
      types?: Array<{ type: string }>;
    };
    return (parsed.types ?? []).map((entry) => entry.type);
  } catch {
    return [];
  }
}

/**
 * Mapo MCP server — development-only.
 *
 * Registers a dedicated `@nuxtjs/mcp-toolkit` handler (default route `/mcp/mapo`)
 * carrying Mapo's docs, API surface, app introspection and scaffolding tools.
 * The definitions live inside this package and are injected through the
 * toolkit's `mcp:definitions:paths` hook, so consuming apps write no MCP files
 * and their own MCP definitions stay untouched.
 */
export default defineNuxtModule<MapoMcpOptions>({
  meta: {
    name: "@mapomodule/mcp",
    configKey: "mapoMcp",
  },

  defaults: {},

  async setup(options, nuxt) {
    const log = logger.withTag("mapo:mcp");
    const enabled = options.enabled ?? nuxt.options.dev;
    if (!enabled) return;

    const resolver = createResolver(import.meta.url);

    // `dist/knowledge` when built, `../dist/knowledge` when running the jiti stub.
    const knowledgeDir = ["./knowledge", "../knowledge", "../dist/knowledge"]
      .map((candidate) => resolver.resolve(candidate))
      .find((candidate) => existsSync(join(candidate, "docs.json")));

    if (!knowledgeDir) {
      log.warn(
        "Knowledge base missing — docs tools will fail. Build it with `pnpm --filter @mapomodule/mcp build`.",
      );
    }

    if (!hasNuxtModule("@nuxtjs/mcp-toolkit")) {
      await installModule(await resolver.resolvePath("@nuxtjs/mcp-toolkit"), {
        name: "Mapo",
        description:
          "Mapo admin framework: docs, APIs, app introspection and scaffolding.",
      });
    }

    // Ship our definitions from inside the package: the toolkit resolves each
    // path against every layer's `server/` dir, and an absolute path wins.
    // Pushing the parent of `handlers/` gives us the named handler `mapo`
    // (route `<mcp.route>/mapo`) with its own tools, resources and prompts.
    // `mcp:definitions:paths` is not augmented onto NuxtHooks by the toolkit,
    // so the listener is registered through a locally typed view of `hook`.
    const hook = nuxt.hook as unknown as (
      name: "mcp:definitions:paths",
      listener: (paths: McpDefinitionPaths) => void,
    ) => void;

    hook("mcp:definitions:paths", (paths) => {
      // `runtime/mcp` must contain nothing but `handlers/`: the toolkit loads
      // every top-level file of a scanned path as a handler definition.
      paths.handlers.push(resolver.resolve("./runtime/mcp"));
    });

    // Build-time app snapshot, filled in by the hooks below and serialised when
    // Nitro renders the virtual module.
    const components: string[] = [];
    const routes: MapoAppManifest["routes"] = [];

    nuxt.hook("components:extend", (registered) => {
      components.length = 0;
      for (const component of registered) {
        if (component.pascalName?.startsWith("Mapo"))
          components.push(component.pascalName);
      }
      components.sort();
    });

    nuxt.hook("pages:extend", (pages) => {
      routes.length = 0;
      const walk = (list: typeof pages) => {
        for (const page of list) {
          routes.push({
            path: page.path,
            ...(page.file ? { file: page.file } : {}),
          });
          if (page.children?.length) walk(page.children);
        }
      };
      walk(pages);
    });

    const buildContext = (): MapoMcpContext => {
      const publicConfig = nuxt.options.runtimeConfig.public as Record<
        string,
        unknown
      >;
      const mapoConfig = Object.fromEntries(
        Object.entries(publicConfig).filter(([key]) =>
          key.toLowerCase().startsWith("mapo"),
        ),
      );

      // Read foreign module config keys structurally: their types are only
      // augmented onto NuxtOptions inside the consuming app's build.
      const options_ = nuxt.options as unknown as ForeignModuleOptions;
      const configuredTypes = Object.keys(
        options_.mapoForm?.fields?.mapping ?? {},
      );
      const defaultTypes = readDefaultFieldTypes(knowledgeDir ?? null);

      const manifest: MapoAppManifest = {
        rootDir: nuxt.options.rootDir,
        dev: nuxt.options.dev,
        modules: (nuxt.options._installedModules ?? [])
          .map((installed) => ({
            name: installed.meta?.name ?? "",
            ...(installed.meta?.version
              ? { version: installed.meta.version }
              : {}),
          }))
          .filter((entry) => entry.name.includes("mapo")),
        config: mapoConfig,
        fieldTypes: [
          ...defaultTypes.map((type) => ({ type, source: "default" as const })),
          ...configuredTypes
            .filter((type) => !defaultTypes.includes(type))
            .map((type) => ({ type, source: "config" as const })),
        ],
        components: [...components],
        routes: [...routes],
        locales: (options_.i18n?.locales ?? []).map((locale) =>
          typeof locale === "string" ? locale : locale.code,
        ),
      };

      return {
        knowledgeDir: knowledgeDir ?? null,
        backend: {
          schemaUrl:
            options.backend?.schemaUrl ??
            process.env.MAPO_BACKEND_SCHEMA_URL ??
            null,
          tokenEnv: options.backend?.tokenEnv ?? "MAPO_BACKEND_TOKEN",
        },
        manifest,
      };
    };

    addServerTemplate({
      filename: "#mapo-mcp/context.mjs",
      getContents: () => `export default ${JSON.stringify(buildContext())}`,
    });

    log.info(
      `MCP server available at ${nuxt.options.devServer?.url ?? "http://localhost:3000"}/mcp/${HANDLER_NAME}`,
    );
  },
}) satisfies NuxtModule<MapoMcpOptions>;

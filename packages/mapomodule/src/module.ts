import {
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  installModule,
  useLogger,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import type { MapoOptions } from "@mapomodule/core";
import type { MapoUikitOptions } from "@mapomodule/uikit";
import type { MapoFormOptions } from "@mapomodule/form";
import type { MapoI18nOptions } from "@mapomodule/i18n";
import type { MapoMcpOptions } from "@mapomodule/mcp/types";
import type { MapoAiOptions } from "@mapomodule/ai/types";

interface MapoModuleOptions extends MapoOptions {
  /** Options forwarded to @mapomodule/uikit (CSS override, Nuxt UI defaults). */
  uikit?: MapoUikitOptions;
  /** Options forwarded to @mapomodule/form (field registry, groups, debounce). */
  form?: MapoFormOptions;
  /** Options forwarded to @mapomodule/i18n (default locale, extra locales). */
  i18n?: MapoI18nOptions;
  /**
   * Options forwarded to @mapomodule/mcp (MCP server for AI assistants).
   * Installed in development only; pass `false` to skip it entirely.
   */
  mcp?: MapoMcpOptions | false;
  /**
   * Options forwarded to @mapomodule/ai (AI-assisted data entry, experimental).
   * Opt-in: the module is installed only when this key is set, `{}` included;
   * without it, or with `false`, nothing of the module is loaded.
   */
  ai?: MapoAiOptions | false;
}

// Meta-module: installs all @mapomodule/* Nuxt modules with a single registration.
// Add this to nuxt.config modules[] and configure everything under the `mapo` key.
export default defineNuxtModule<MapoModuleOptions>({
  meta: {
    name: "mapomodule",
    configKey: "mapo",
  },

  async setup(options, nuxt) {
    // Resolve paths from mapomodule's own node_modules so pnpm strict mode
    // doesn't require the consuming app to declare each @mapomodule/* directly.
    const resolver = createResolver(import.meta.url);

    if (!hasNuxtModule("@mapomodule/store")) {
      await installModule(await resolver.resolvePath("@mapomodule/store"));
    }

    // Forward only core options: `uikit`, `form`, `i18n`, `mcp` and `ai` have
    // their own modules, and leaking them into `runtimeConfig.public.mapoCore`
    // would change its generated type per-app.
    const { uikit, form, i18n, mcp, ai, ...coreOptions } = options;

    if (!hasNuxtModule("@mapomodule/i18n")) {
      await installModule(
        await resolver.resolvePath("@mapomodule/i18n"),
        i18n ?? {},
      );
    }

    if (!hasNuxtModule("@mapomodule/core")) {
      await installModule(
        await resolver.resolvePath("@mapomodule/core"),
        coreOptions satisfies MapoOptions,
      );
    }

    if (!hasNuxtModule("@mapomodule/uikit")) {
      await installModule(
        await resolver.resolvePath("@mapomodule/uikit"),
        uikit ?? {},
      );
    }

    if (!hasNuxtModule("@mapomodule/form")) {
      await installModule(
        await resolver.resolvePath("@mapomodule/form"),
        form ?? {},
      );
    }

    // MCP server for AI assistants: development only, and never installed when
    // the app opts out with `mapo: { mcp: false }`.
    const mcpEnabled = mcp !== false && (mcp?.enabled ?? nuxt.options.dev);
    if (mcpEnabled && !hasNuxtModule("@mapomodule/mcp")) {
      await installModule(
        await resolver.resolvePath("@mapomodule/mcp"),
        mcp || {},
      );
    }

    // AI-assisted data entry: opt-in, so an app that does not set `mapo.ai`
    // never loads the module, its routes or its dependencies.
    const aiOptedOut = ai === false;
    const aiConfigured = ai !== undefined;
    const isAiListed = hasNuxtModule("@mapomodule/ai");
    if (aiConfigured && !aiOptedOut && !isAiListed) {
      await installModule(await resolver.resolvePath("@mapomodule/ai"), ai);
    }
    // Listed in `modules` too, the module reads its own key, `mapoAi`, and
    // what `mapo.ai` holds never reaches it: a lost `users` lets everyone in.
    const hasAiOptions =
      typeof ai === "object" && ai !== null && Object.keys(ai).length > 0;
    if (isAiListed && hasAiOptions) {
      useLogger("mapomodule").warn(
        "mapo.ai has options, but @mapomodule/ai is also listed in `modules`, so it reads `mapoAi` and the options in `mapo.ai` are not applied. Move them to `mapoAi`, or take @mapomodule/ai out of `modules`.",
      );
    }
  },
}) satisfies NuxtModule<MapoModuleOptions>;

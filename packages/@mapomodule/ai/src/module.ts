import {
  addComponent,
  addImports,
  addPluginTemplate,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
  useLogger,
  useNitro,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import { accessRuleOption } from "./access";
import type { MapoAiOptions } from "./index";
import { MAPO_AI_READER_IDS } from "./runtime/server/readers/registry";
import {
  providerKeyOf,
  providerKeyVariable,
  readRunOptions,
} from "./runtime/server/run/options";
import { MAPO_AI_GATEWAY_PATH } from "./runtime/shared/gateway";
import { isRecord } from "./runtime/shared/guards";
import { settingsOption } from "./settings";
import { addDefaultStorageMount } from "./storage";

export type { MapoAiOptions, MapoAiStatus } from "./index";

/** Magic Fill's components, registered by name. */
const MAGIC_FILL_COMPONENTS = [
  "MapoAiMagicFillAction",
  "MapoAiMagicFillBanner",
  "MapoAiMagicFillPanel",
  "MapoAiMagicFillPreview",
] as const;

/**
 * The plugin that adds Magic Fill to every `MapoDetail`: the button in the
 * sidebar card (`actions`) and the banner above the form (`body-top`), each
 * handed the detail it sits in. Generated in the app, which has uikit.
 */
const MAGIC_FILL_PLUGIN = `import { defineComponent, h } from "vue";
import { defineDetailExtension, defineNuxtPlugin, useMapoDetail } from "#imports";
import {
  LazyMapoAiMagicFillAction,
  LazyMapoAiMagicFillBanner,
} from "#components";

// A part of Magic Fill, handed the detail it sits in.
function withDetail(name, component) {
  return defineComponent({
    name,
    setup() {
      const detail = useMapoDetail();
      return () => (detail ? h(component, { detail }) : null);
    },
  });
}

export default defineNuxtPlugin({
  name: "mapo-ai:magic-fill",
  setup(nuxtApp) {
    // definePageMeta({ magicFill: false }) turns it off on a page.
    const shown = () =>
      nuxtApp.$router?.currentRoute.value.meta.magicFill !== false;
    defineDetailExtension({
      key: "mapo-ai-magic-fill",
      placement: "actions",
      component: withDetail("MapoAiMagicFillActionHost", LazyMapoAiMagicFillAction),
      visible: shown,
    });
    defineDetailExtension({
      key: "mapo-ai-magic-fill-summary",
      placement: "body-top",
      component: withDetail("MapoAiMagicFillBannerHost", LazyMapoAiMagicFillBanner),
      visible: shown,
      order: -100,
    });
  },
});
`;

/** The page's meta key that turns Magic Fill off, typed for the app's pages. */
const MAGIC_FILL_PAGE_META = `declare module "#app" {
  interface PageMeta {
    /** \`false\` turns Magic Fill off on this page. */
    magicFill?: boolean;
  }
}
declare module "vue-router" {
  interface RouteMeta {
    /** \`false\` turns Magic Fill off on this page. */
    magicFill?: boolean;
  }
}
export {};
`;

/** `mapo.ai.magicFill`: on unless `false`; another value keeps it on, with a warning. */
function magicFillOption(
  value: unknown,
  warn: (message: string) => void,
): boolean {
  const isRead = value === undefined || typeof value === "boolean";
  if (!isRead)
    warn("mapo.ai.magicFill is not true or false: Magic Fill stays on.");
  return value !== false;
}

/**
 * Mapo AI-assisted data entry (experimental).
 *
 * Registers the AI gateway on the app's own Nitro server, under
 * `/_mapo/ai/*`: `status`; `read`, which reads a file into text with
 * Mapo's readers or the app's; `run`, which calls the providers the app
 * enables; `keys`, where the AI's admins assign keys to everyone, a group
 * or a user, and `token`, where a user saves their own where allowed. Its state goes to a sealed storage: the Nitro mount `mapo-ai`,
 * encrypted with `NUXT_MAPO_AI_SECRET`. The app's pages get
 * `useMapoAiFill()`, which fills a detail form through `run`, and
 * `useMapoAiRead()`, which reads a file through `read`. Opt-in: the
 * meta-module installs it only when the app sets `mapo.ai`, so an app
 * without that key loads nothing of it.
 */
export default defineNuxtModule<MapoAiOptions>({
  meta: {
    name: "@mapomodule/ai",
    configKey: "mapoAi",
  },

  defaults: {},

  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    const logger = useLogger("@mapomodule/ai");

    // Private runtime config, never public: NUXT_MAPO_AI_SECRET fills it when
    // the server starts. A value written here instead is copied into the
    // server bundle at build time.
    const runtimeConfig = nuxt.options.runtimeConfig.mapoAi;
    const configured = isRecord(runtimeConfig) ? runtimeConfig : {};
    const isBuildTimeSecret =
      typeof configured.secret === "string" && configured.secret !== "";
    if (isBuildTimeSecret) {
      logger.warn(
        "runtimeConfig.mapoAi.secret is set in the Nuxt config, so the build copies it into the server bundle. Set NUXT_MAPO_AI_SECRET in the server's environment instead.",
      );
    }
    // Who administers and who uses the AI, read by the gateway at runtime:
    // private too, since the rules are the server's to apply.
    const warn = (message: string) => logger.warn(message);
    const admin = accessRuleOption(options.admin, "admin", warn) ?? {};
    const users = accessRuleOption(options.users, "users", warn);
    // The options of `run`, complete with their defaults, so the
    // environment can change any of them (`NUXT_MAPO_AI_LIMITS_…`).
    const run = readRunOptions(options, warn);
    const isDefaultKnown =
      run.default.provider === undefined ||
      Object.hasOwn(run.providers, run.default.provider);
    if (!isDefaultKnown) {
      warn(
        `mapo.ai.default.provider is "${run.default.provider}", which mapo.ai.providers does not enable: the first provider it enables is the default.`,
      );
    }
    // The project's key of a provider comes from the environment
    // (`NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`), which fills only a place the
    // runtime config has: every provider but the mock gets one, an app's
    // too. A key written in the config is used, but the build copies it into
    // the server bundle.
    const providers = Object.fromEntries(
      Object.entries(run.providers).map(([id, enabled]) => {
        if (id === "mock") return [id, enabled];
        const inOptions = providerKeyOf(options, id, warn);
        const inRuntimeConfig = providerKeyOf(configured, id, warn);
        const where = inOptions
          ? `mapo.ai.providers.${id}.apiKey`
          : `runtimeConfig.mapoAi.providers.${id}.apiKey`;
        const written = inOptions ?? inRuntimeConfig;
        if (written) {
          logger.warn(
            `${where} is set in the Nuxt config, so the build copies it into the server bundle. Set ${providerKeyVariable(id)} in the server's environment instead.`,
          );
        }
        return [id, { ...enabled, apiKey: written ?? "" }];
      }),
    );
    // Every reader of Mapo has its place, so the environment can turn one
    // off at runtime (`NUXT_MAPO_AI_READERS_XLSX=false`).
    const readers = {
      ...Object.fromEntries(MAPO_AI_READER_IDS.map((id) => [id, true])),
      ...run.readers,
    };
    nuxt.options.runtimeConfig.mapoAi = {
      secret: "",
      ...configured,
      admin,
      ...(users ? { users } : {}),
      ...run,
      providers,
      readers,
    };

    // The AI settings page: where it is, and which endpoints of the backend
    // the admins search users and groups with. The endpoints go in the
    // public runtime config, where the page reads them and the environment
    // can change them (`NUXT_PUBLIC_MAPO_AI_SETTINGS_USERS_API`).
    const settings = settingsOption(options.settings, warn);
    const publicConfig = nuxt.options.runtimeConfig.public;
    const publicAi = isRecord(publicConfig.mapoAi) ? publicConfig.mapoAi : {};
    publicConfig.mapoAi = {
      ...publicAi,
      settings: {
        usersApi: settings.usersApi ?? "",
        groupsApi: settings.groupsApi ?? "",
      },
    };
    addComponent({
      name: "MapoAiSettings",
      filePath: resolver.resolve("./runtime/components/MapoAiSettings.vue"),
    });
    // Magic Fill's parts, registered by name: an app replaces one with a
    // file of the same name in `app/mapooverride/`, as uikit's.
    for (const name of MAGIC_FILL_COMPONENTS) {
      addComponent({
        name,
        filePath: resolver.resolve(`./runtime/components/${name}.vue`),
      });
    }
    const { path: settingsPath, label: settingsLabel } = settings;
    if (settingsPath !== false) {
      // Added only when the app has no page on that path, as uikit does
      // with /login. The layout and the middleware live in `meta`: the
      // page is loaded from node_modules, where definePageMeta() is no
      // auto-import.
      extendPages((pages) => {
        if (pages.some((page) => page.path === settingsPath)) return;
        pages.push({
          name: "mapo-ai-settings",
          path: settingsPath,
          file: resolver.resolve("./runtime/pages/ai-settings.vue"),
          meta: {
            layout: "mapo-default",
            middleware: ["auth"],
            label: settingsLabel,
            icon: "i-lucide-sparkles",
            sidebarFooter: true,
          },
        });
      });
    }

    // Magic Fill on every MapoDetail: two detail extensions, registered by a
    // plugin generated in the app, since this package does not depend on
    // uikit. It reads uikit's `defineDetailExtension()` and `useMapoDetail()`
    // from the app's imports, and the components by name, overrides
    // included. A page turns it off with `definePageMeta({ magicFill: false })`.
    const magicFill = magicFillOption(options.magicFill, warn);
    addTypeTemplate({
      filename: "types/mapo-ai-magic-fill.d.ts",
      getContents: () => MAGIC_FILL_PAGE_META,
    });
    nuxt.hook("modules:done", () => {
      if (!magicFill) return;
      if (!hasNuxtModule("@mapomodule/uikit", nuxt)) {
        logger.warn(
          "Magic Fill needs @mapomodule/uikit, which this app does not install: it is left out.",
        );
        return;
      }
      addPluginTemplate({
        filename: "mapo-ai-magic-fill.mjs",
        getContents: () => MAGIC_FILL_PLUGIN,
      });
    });

    // The hooks, `mapo-ai:user`, `mapo-ai:prompt` and `mapo-ai:read`, typed
    // in the app's server code.
    addTypeTemplate(
      {
        filename: "types/mapo-ai.d.ts",
        getContents: () =>
          `import "${resolver.resolve("./runtime/server/auth/hooks")}";\nexport {};\n`,
      },
      { nitro: true },
    );

    // The state goes to the `mapo-ai` mount: the app's own driver, or the
    // file system. At `ready` Nitro exists, with its options resolved (the
    // preset included), and its build has not started.
    nuxt.hook("ready", () => {
      addDefaultStorageMount(useNitro().options);
    });

    addServerPlugin(resolver.resolve("./runtime/server/plugins/storage"));
    addServerPlugin(resolver.resolve("./runtime/server/plugins/providers"));

    // What an app's Nitro plugins use, without an import.
    addServerImports([
      {
        name: "registerMapoAiProvider",
        from: resolver.resolve("./runtime/server/providers/registry"),
      },
      {
        name: "MapoAiProviderError",
        from: resolver.resolve("./runtime/server/providers/types"),
      },
      {
        name: "registerMapoAiMockFixtures",
        from: resolver.resolve("./runtime/server/providers/mock"),
      },
      {
        name: "registerMapoAiReader",
        from: resolver.resolve("./runtime/server/readers/registry"),
      },
    ]);

    // What the app's pages use, without an import: the composables that
    // fill a detail form and read a file through the gateway, Magic Fill's
    // state of a detail, and what the gateway offers the user.
    addImports([
      {
        name: "useMapoAiFill",
        from: resolver.resolve("./runtime/composables/useMapoAiFill"),
      },
      {
        name: "useMapoAiRead",
        from: resolver.resolve("./runtime/composables/useMapoAiRead"),
      },
      {
        name: "useMapoAiMagicFill",
        from: resolver.resolve("./runtime/composables/useMapoAiMagicFill"),
      },
      {
        name: "useMapoAiStatus",
        from: resolver.resolve("./runtime/composables/useMapoAiStatus"),
      },
    ]);

    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/status`,
      method: "get",
      handler: resolver.resolve("./runtime/server/routes/status.get"),
    });
    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/read`,
      method: "post",
      handler: resolver.resolve("./runtime/server/routes/read.post"),
    });
    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/run`,
      method: "post",
      handler: resolver.resolve("./runtime/server/routes/run.post"),
    });
    // What a call would send, for "What I send to the AI": it calls nothing.
    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/run/preview`,
      method: "post",
      handler: resolver.resolve("./runtime/server/routes/run-preview.post"),
    });
    // The keys: the admins assign them, each user saves their own token
    // where an assignment allows one; the AI settings: the user's
    // preference, the check of a provider's connection, how the AI works
    // in the whole app, which its admins change, and the usage and the
    // changes, read from the audit.
    const keyRoutes = [
      ["keys", "get", "keys.get"],
      ["keys", "put", "keys.put"],
      ["keys/groups", "put", "keys-groups.put"],
      ["keys/:id", "delete", "keys-id.delete"],
      ["token", "put", "token.put"],
      ["token", "delete", "token.delete"],
      ["preferences", "put", "preferences.put"],
      ["preferences", "delete", "preferences.delete"],
      ["test", "post", "test.post"],
      ["settings", "get", "settings.get"],
      ["settings", "put", "settings.put"],
      ["settings/preview", "post", "settings-preview.post"],
      ["usage", "get", "usage.get"],
      ["usage/mine", "get", "usage-mine.get"],
      ["actions", "get", "actions.get"],
    ] as const;
    for (const [path, method, file] of keyRoutes) {
      addServerHandler({
        route: `${MAPO_AI_GATEWAY_PATH}/${path}`,
        method,
        handler: resolver.resolve(`./runtime/server/routes/${file}`),
      });
    }
  },
}) satisfies NuxtModule<MapoAiOptions>;

import {
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  useLogger,
  useNitro,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import { accessRuleOption } from "./access";
import type { MapoAiOptions } from "./index";
import { readRunOptions } from "./runtime/server/run/options";
import { MAPO_AI_GATEWAY_PATH } from "./runtime/shared/gateway";
import { isRecord } from "./runtime/shared/guards";
import { addDefaultStorageMount } from "./storage";

export type { MapoAiOptions, MapoAiStatus } from "./index";

/**
 * Mapo AI-assisted data entry (experimental).
 *
 * Registers the AI gateway on the app's own Nitro server, under
 * `/_mapo/ai/*`: `status`, and `run`, which calls the providers the app
 * enables. Its state goes to a sealed storage: the Nitro mount `mapo-ai`,
 * encrypted with `NUXT_MAPO_AI_SECRET`. Opt-in: the meta-module installs it
 * only when the app sets `mapo.ai`, so an app without that key loads
 * nothing of it.
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
    nuxt.options.runtimeConfig.mapoAi = {
      secret: "",
      ...configured,
      admin,
      ...(users ? { users } : {}),
      ...run,
    };

    // The hooks, `mapo-ai:user` and `mapo-ai:prompt`, typed in the app's
    // server code.
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
    ]);

    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/status`,
      method: "get",
      handler: resolver.resolve("./runtime/server/routes/status.get"),
    });
    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/run`,
      method: "post",
      handler: resolver.resolve("./runtime/server/routes/run.post"),
    });
  },
}) satisfies NuxtModule<MapoAiOptions>;

import {
  addServerHandler,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  useLogger,
  useNitro,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import type { MapoAiOptions } from "./index";
import { MAPO_AI_GATEWAY_PATH } from "./runtime/shared/gateway";
import { isRecord } from "./runtime/shared/guards";
import { addDefaultStorageMount } from "./storage";

export type { MapoAiOptions, MapoAiStatus } from "./index";

/**
 * Mapo AI-assisted data entry (experimental).
 *
 * Registers the AI gateway on the app's own Nitro server, under
 * `/_mapo/ai/*`, with the sealed storage it keeps its state in: the Nitro
 * mount `mapo-ai`, encrypted with `NUXT_MAPO_AI_SECRET`. Opt-in: the
 * meta-module installs it only when the app sets `mapo.ai`, so an app
 * without that key loads nothing of it.
 */
export default defineNuxtModule<MapoAiOptions>({
  meta: {
    name: "@mapomodule/ai",
    configKey: "mapoAi",
  },

  defaults: {},

  setup(_options, nuxt) {
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
    nuxt.options.runtimeConfig.mapoAi = { secret: "", ...configured };

    // The state goes to the `mapo-ai` mount: the app's own driver, or the
    // file system. At `ready` Nitro exists, with its options resolved (the
    // preset included), and its build has not started.
    nuxt.hook("ready", () => {
      addDefaultStorageMount(useNitro().options);
    });

    addServerPlugin(resolver.resolve("./runtime/server/plugins/storage"));

    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/status`,
      method: "get",
      handler: resolver.resolve("./runtime/server/routes/status.get"),
    });
  },
}) satisfies NuxtModule<MapoAiOptions>;

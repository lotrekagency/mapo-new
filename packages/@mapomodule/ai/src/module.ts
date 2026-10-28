import { addServerHandler, createResolver, defineNuxtModule } from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import type { MapoAiOptions } from "./index";
import { MAPO_AI_GATEWAY_PATH } from "./runtime/shared/gateway";

export type { MapoAiOptions, MapoAiStatus } from "./index";

/**
 * Mapo AI-assisted data entry (experimental).
 *
 * Registers the AI gateway on the app's own Nitro server, under
 * `/_mapo/ai/*`. Opt-in: the meta-module installs it only when the app sets
 * `mapo.ai`, so an app without that key loads nothing of it.
 */
export default defineNuxtModule<MapoAiOptions>({
  meta: {
    name: "@mapomodule/ai",
    configKey: "mapoAi",
  },

  defaults: {},

  setup() {
    const resolver = createResolver(import.meta.url);

    addServerHandler({
      route: `${MAPO_AI_GATEWAY_PATH}/status`,
      method: "get",
      handler: resolver.resolve("./runtime/server/routes/status.get"),
    });
  },
}) satisfies NuxtModule<MapoAiOptions>;

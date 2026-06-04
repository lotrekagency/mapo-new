import { defineNitroPlugin } from "nitropack/runtime";
import type { CamomillaRuntimeConfig } from "../../../types";

declare module "h3" {
  interface H3EventContext {
    camomillaConfig?: CamomillaRuntimeConfig;
  }
}

/**
 * Nitro plugin that attaches Camomilla runtime config to request context.
 *
 * This allows server middleware to read integration settings from
 * `event.context.camomillaConfig` during request handling.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("request", (event) => {
    // useRuntimeConfig is available at Nitro request time via the global
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event.context.camomillaConfig = (globalThis as any).__nuxt_runtime_config__
      ?.camomilla as CamomillaRuntimeConfig | undefined;
  });
});

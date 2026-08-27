/**
 * Provides the global `$mapoMediaAdapter`, defaulting to plain REST semantics.
 *
 * Integrations (e.g. Camomilla) register their own plugin ordered BEFORE this
 * one; the first provider wins because Nuxt `provide` getters are
 * non-configurable — redefining one throws `Cannot redefine property` in SSR.
 * This plugin therefore only fills the gap when no integration registered an
 * adapter. Consumers of the adapter fall back to `defaultMediaAdapter`
 * method-by-method, so partial adapters are fine. Functions are not
 * serializable through `runtimeConfig`, hence the plugin-injection pattern.
 */
import { defineNuxtPlugin } from "#app";
import { defaultMediaAdapter } from "../adapters/defaultMediaAdapter.js";
import type { MediaAdapter } from "../types/media.js";

declare module "#app" {
  interface NuxtApp {
    $mapoMediaAdapter: MediaAdapter;
  }
}

declare module "vue" {
  interface ComponentCustomProperties {
    $mapoMediaAdapter: MediaAdapter;
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  if ("$mapoMediaAdapter" in nuxtApp) return;
  return {
    provide: { mapoMediaAdapter: defaultMediaAdapter },
  };
});

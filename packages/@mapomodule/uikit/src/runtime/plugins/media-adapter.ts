/**
 * Provides the global `$mapoMediaAdapter`, defaulting to plain REST semantics.
 *
 * Integrations (e.g. Camomilla) register their own plugin ordered AFTER this one
 * and remap request params / normalize responses by assigning over the methods
 * of the provided object. They must not `provide` the key a second time: Nuxt
 * defines it as a non-configurable property, so a second provide throws.
 * Functions are not serializable through `runtimeConfig`, so this mirrors the
 * `$mapoFormRegistry` pattern.
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

export default defineNuxtPlugin(() => {
  // A fresh copy per Nuxt app instance — per request under SSR, so integrations
  // cannot leak overrides across requests. It must be a copy because since Nuxt
  // 4.5 `provide` defines a non-configurable property: a second `provide` of the
  // same key throws "Cannot redefine property". Integrations therefore override
  // methods by mutating this object instead of re-providing it.
  return {
    provide: { mapoMediaAdapter: { ...defaultMediaAdapter } },
  };
});

/**
 * Provides the global `$mapoMediaAdapter`, defaulting to plain REST semantics.
 *
 * Integrations (e.g. Camomilla) register their own plugin ordered AFTER this one
 * that overrides `$mapoMediaAdapter` (or merges specific methods) to remap
 * request params / normalize responses. Functions are not serializable through
 * `runtimeConfig`, so this mirrors the `$mapoFormRegistry` pattern.
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
  return {
    provide: { mapoMediaAdapter: defaultMediaAdapter },
  };
});

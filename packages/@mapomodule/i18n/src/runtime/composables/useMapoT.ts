import { useNuxtApp } from "nuxt/app";

type TranslateFn = (key: string, named?: Record<string, unknown>) => string;

/**
 * Returns the global vue-i18n `t` function bound to the app's i18n instance.
 *
 * Use this in contexts where `useI18n()` is not available — Pinia store
 * actions, composables invoked outside component `setup`, imperative
 * snack/confirm messages. Inside components prefer `useI18n()` from
 * `vue-i18n`, which is reactive to locale changes in render functions.
 */
export function useMapoT(): TranslateFn {
  const { $i18n } = useNuxtApp() as unknown as {
    $i18n?: { t: TranslateFn };
  };
  // Degrade to the raw key instead of throwing when no i18n instance is
  // available (unit tests instantiating a store outside a Nuxt app).
  if (!$i18n?.t) return (key) => key;
  return (key, named) => (named ? $i18n.t(key, named) : $i18n.t(key));
}

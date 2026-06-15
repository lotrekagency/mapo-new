import { getCurrentInstance, inject, provide, ref, type Ref } from "vue";

const LANG_KEY = Symbol("mapoCurrentLang");

/** Provides the current form language to descendant components. */
export function provideCurrentLang(lang: Ref<string>) {
  provide(LANG_KEY, lang);
}

/** Returns the current form language, falling back to the provided ref when needed. */
export function useCurrentLang(fallback?: Ref<string>): Ref<string> {
  // Outside setup() (for example in tests), Vue 3 returns `undefined` from inject()
  // and ignores the default value, so the "no instance" case must be handled explicitly.
  if (!getCurrentInstance()) return fallback ?? ref("");
  return inject<Ref<string>>(LANG_KEY, fallback ?? ref(""));
}

import { useRuntimeConfig } from "#app";

/**
 * The app's `mapo.uikit.contentLanguages`: the content languages editors may
 * switch between, in order. Empty when the app sets none, which restricts
 * nothing. Narrow a list with `restrictLanguages` from `./langInfo`.
 *
 * Kept apart from `langInfo.ts`, whose helpers stay free of Nuxt imports.
 */
export function useContentLanguages(): string[] {
  const runtimeConfig = useRuntimeConfig();
  const uikit = (runtimeConfig.public.mapoUikit ?? {}) as {
    contentLanguages?: unknown;
  };
  const configured = uikit.contentLanguages;
  if (!Array.isArray(configured)) return [];
  return configured.filter((code): code is string => typeof code === "string");
}

// Re-export types for direct TypeScript access outside Nuxt context
import en from "./runtime/locales/mapo.en.json";

export type { MapoI18nOptions, MapoLocale } from "./module";

/**
 * Shape of the Mapo built-in message catalog (English is the source of
 * truth — every locale ships the same keys).
 */
export type MapoMessages = typeof en;

/**
 * Recursively builds the union of dot-separated key paths of an object type.
 * `{ mapo: { save: string } }` → `"mapo" | "mapo.save"`.
 */
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${Prefix}${K}` | DotPaths<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

/**
 * Union of every valid Mapo translation key
 * (e.g. `"mapo.save"`, `"mapo.menuManager.noSelectedNode"`).
 *
 * Useful to type helper wrappers in consuming apps:
 * ```ts
 * import type { MapoI18nKey } from "@mapomodule/i18n/types";
 * const key: MapoI18nKey = "mapo.save";
 * t(key);
 * ```
 */
export type MapoI18nKey = DotPaths<MapoMessages>;

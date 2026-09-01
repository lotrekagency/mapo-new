/**
 * `lang_info`, as served by Camomilla on an endpoint's OPTIONS response.
 *
 * It describes the MODEL, not the site and not a record: a multilingual site can
 * still expose models nobody registered for translation, and rendering a
 * language switcher for those invites the user to type values the backend will
 * drop on save.
 *
 * OPTIONS rather than the record payload because it is metadata, and because a
 * "create new" form has no record to read it from.
 */
export interface LangInfo {
  /** Whether this model is registered for translation at all. */
  translatable?: boolean;
  /** Codes usable for THIS model. Empty when it is not translatable. */
  languages?: string[];
  /** What the site supports. Present for context; not model-specific. */
  site_languages?: string[];
  default?: string;
  active?: string;
}

/**
 * Language codes a model can be translated into, read from its OPTIONS metadata.
 *
 * Returns `[]` — meaning "render no language switcher" — when the model is not
 * translatable and when `lang_info` is absent entirely. A backend that does not
 * publish the field cannot be assumed multilingual.
 */
export function languagesFromMetadata(metadata: unknown): string[] {
  const info = (metadata as Record<string, unknown> | null | undefined)
    ?.lang_info as LangInfo | undefined;
  if (!info || info.translatable === false) return [];
  if (!Array.isArray(info.languages)) return [];
  return info.languages.filter(
    (code): code is string => typeof code === "string",
  );
}

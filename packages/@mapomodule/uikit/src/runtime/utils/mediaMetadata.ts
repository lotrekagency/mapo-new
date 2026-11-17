import type { MediaItem, MediaUploadPayload } from "../types/media.js";

/** The text metadata of a media: the fields the editor and the uploader fill. */
export const MEDIA_METADATA_FIELDS = [
  "title",
  "alt_text",
  "description",
] as const;

export type MediaMetadataField = (typeof MEDIA_METADATA_FIELDS)[number];

type MetadataValues = Partial<Record<MediaMetadataField, string | null>>;

// Backends return `null` for a field nobody filled, inputs hand back "": both
// mean empty, and telling them apart would send edits nobody made.
function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? "") === (b ?? "");
}

/**
 * The metadata of `media` that differs from `previous`, as a PATCH body: plain
 * fields, and `translations` narrowed to the languages and fields that changed.
 *
 * A full body breaks translated media in two ways. A backend that translates
 * media (Camomilla, through django-modeltranslation) maps a plain field and its
 * active-language translation to the same column, so a body carrying both
 * writes whichever the backend applies last, and Camomilla applies the
 * translations, holding the values read when the editor opened. And every other
 * language is rewritten with those values, over any change made since.
 */
export function mediaMetadataPatch(
  media: MediaItem,
  previous: MediaItem,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of MEDIA_METADATA_FIELDS) {
    if (sameValue(media[field], previous[field])) continue;
    patch[field] = media[field] ?? "";
  }

  const translations: Record<string, MetadataValues> = {};
  for (const [lang, values] of Object.entries(media.translations ?? {})) {
    const before: MetadataValues = previous.translations?.[lang] ?? {};
    for (const field of MEDIA_METADATA_FIELDS) {
      const value = values?.[field];
      if (sameValue(value, before[field])) continue;
      const changed = (translations[lang] ??= {});
      changed[field] = value ?? "";
    }
  }
  const hasTranslations = Object.keys(translations).length > 0;
  if (hasTranslations) patch.translations = translations;

  return patch;
}

/** The text metadata of a media, to carry edits over a fresh server copy. */
export function pickMetadata(
  media: MediaItem,
): Pick<MediaItem, MediaMetadataField | "translations"> {
  return {
    title: media.title,
    alt_text: media.alt_text,
    description: media.description,
    translations: media.translations,
  };
}

/**
 * The body of an upload request, before the multipart encoding.
 *
 * With a `lang`, the text metadata goes into `translations[lang]`: a backend
 * that translates media ignores plain translatable fields (Camomilla drops them
 * on write), and the upload would lose its title and alt text. Without one it
 * stays in plain fields. Empty values are left out.
 */
export function buildUploadBody(
  payload: MediaUploadPayload,
  lang?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = { file: payload.file };

  const metadata: MetadataValues = {};
  for (const field of MEDIA_METADATA_FIELDS) {
    const value = payload[field];
    if (value) metadata[field] = value;
  }
  const hasMetadata = Object.keys(metadata).length > 0;
  if (hasMetadata && lang) body.translations = { [lang]: metadata };
  else Object.assign(body, metadata);

  if (payload.folder != null) body.folder = payload.folder;
  return body;
}

// Keys that hold messages about the whole request, not about one field.
const GENERAL_ERROR_KEYS = new Set(["detail", "non_field_errors"]);

function errorLabel(path: string[], labels: Record<string, string>): string {
  const key = path.join(".");
  if (GENERAL_ERROR_KEYS.has(key)) return "";

  // Nested translation: `translations.<lang>.<field>`.
  const [head, lang = "", field = ""] = path;
  const isTranslation = head === "translations";
  const hasLangAndField = path.length === 3;
  if (isTranslation && hasLangAndField) {
    return `${labels[field] ?? field} (${lang.toUpperCase()})`;
  }

  const ownLabel = labels[key];
  if (ownLabel) return ownLabel;
  // Per-language column, as django-modeltranslation names it: `<field>_<lang>`.
  for (const [name, label] of Object.entries(labels)) {
    if (!key.startsWith(`${name}_`)) continue;
    return `${label} (${key.slice(name.length + 1).toUpperCase()})`;
  }
  return key;
}

/**
 * Lines for an error toast, out of a DRF error body: `Label: message` for each
 * field.
 *
 * Covers the shapes a media save fails with: plain fields (`title`),
 * per-language columns (`title_it`, as Camomilla reports them) and nested
 * translations (`translations.it.title`). `detail` and `non_field_errors` are
 * about the whole request and show without a label; a field missing from
 * `labels` shows its key.
 */
export function describeMediaErrors(
  data: unknown,
  labels: Record<string, string>,
): string[] {
  const lines: string[] = [];
  const add = (path: string[], messages: string[]) => {
    if (!messages.length) return;
    const label = errorLabel(path, labels);
    const text = messages.join(", ");
    lines.push(label ? `${label}: ${text}` : text);
  };
  const walk = (value: unknown, path: string[]) => {
    // A bare string body is no DRF error (an HTML error page from a proxy,
    // say): only strings under a key are messages.
    const isMessage = typeof value === "string";
    const isUnderAKey = path.length > 0;
    if (isMessage) {
      if (isUnderAKey) add(path, [value]);
      return;
    }
    if (Array.isArray(value)) {
      add(
        path,
        value.filter((item): item is string => typeof item === "string"),
      );
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      walk(nested, [...path, key]);
    }
  };
  walk(data, []);
  return lines;
}

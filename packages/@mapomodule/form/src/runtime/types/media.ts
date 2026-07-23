/**
 * Media **value** types — the shape that lands in the form model for the
 * `media`, `media-m2m`, and `enhanced-media` field types.
 *
 * These live in `@mapomodule/form` (next to their descriptors) because they are
 * a form contract, not a Media Manager implementation detail. `@mapomodule/uikit`
 * re-exports them from `runtime/types/media.ts` alongside the store/adapter types
 * so the Media Manager keeps a single import surface.
 */

/** A model instance referencing a media (Camomilla returns these as `links`). */
export interface MediaLink {
  model: string;
  id: number;
  name: string;
}

export interface MediaItem {
  id: number;
  file: string;
  mime_type: string;
  title: string;
  alt_text: string;
  description: string;
  size: number;
  created: string;
  modified: string;
  folder?: number | null;
  name?: string;
  /** Model instances that reference this media — shown in the editor info panel. */
  links?: MediaLink[];
  translations?: Record<
    string,
    { title?: string; alt_text?: string; description?: string }
  >;
}

/** Value of an `enhanced-media` field: a media plus inline caption metadata. */
export interface EnhancedMediaValue {
  media: MediaItem | null;
  alt?: string;
  caption?: string;
  [key: string]: unknown;
}

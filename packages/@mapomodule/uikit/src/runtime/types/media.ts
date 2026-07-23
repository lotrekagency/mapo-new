/**
 * Media **value** types are owned by `@mapomodule/form` (they are the value that
 * lands in the form model, next to their descriptors) and re-exported here so the
 * Media Manager keeps a single import surface. `uikit` already depends on `form`,
 * so this direction introduces no cycle.
 */
export type {
  MediaLink,
  MediaItem,
  EnhancedMediaValue,
} from "@mapomodule/form/types";

import type { MediaItem } from "@mapomodule/form/types";

export interface MediaFolder {
  id: number;
  name: string;
  parent?: number | null;
  /**
   * Materialized path of the folder (e.g. "root/images/hero").
   * Camomilla returns it and the breadcrumb uses it for deduplication.
   * Falls back to `id` when absent.
   */
  path?: string;
}

export interface MediaApiResponse {
  media: {
    items: MediaItem[];
    paginator: { page: number; pages: number };
  };
  folders: MediaFolder[];
  parent_folder: MediaFolder | null;
}

export type SelectMode = "none" | "single" | "multi";

export interface MediaGetRootParams {
  page?: number;
  folder?: number | null;
  search?: string;
  mime?: string | null;
  all?: boolean;
}

export interface MediaUploadPayload {
  file: File;
  title?: string;
  alt_text?: string;
  description?: string;
  folder?: number | null;
}

/**
 * REST endpoints used by the media store. Configured via
 * `mapo.uikit.media.endpoints` in `nuxt.config.ts` and forwarded to
 * `runtimeConfig.public.mapoMedia`.
 */
export interface MediaEndpoints {
  /** Single-media CRUD: detail, partialUpdate, delete, upload (POST). Default `/api/media`. */
  media: string;
  /** Folder navigation + CRUD: list (root), detail (enter folder), create, delete. Default `/api/media-folders`. */
  folders: string;
}

/**
 * Context passed to the adapter when building list/detail query params.
 * Values are the **canonical** Mapo params — the adapter maps them to the
 * shape the target backend expects (e.g. `mime` → `fltr=mime_type=`).
 */
export interface MediaListParamsContext {
  page?: number;
  search?: string;
  mime?: string | null;
  all?: boolean;
}

/**
 * Backend adapter for the media store. Lets integrations (e.g. Camomilla)
 * remap request params and normalize responses without coupling the store to a
 * specific backend. Injected as `$mapoMediaAdapter` by a Nuxt plugin — functions
 * are not serializable through `runtimeConfig`, so this mirrors the
 * `$mapoFormRegistry` pattern.
 *
 * Every method is optional; the default adapter applies plain REST semantics.
 */
export interface MediaAdapter {
  /**
   * Build the query params object for the `getRoot` list/detail request.
   * @example
   * // Camomilla: { page, search, fltr: 'mime_type=image/png' }
   */
  buildListParams?(ctx: MediaListParamsContext): Record<string, unknown>;
  /**
   * Normalize a raw `getRoot` response (folder list or detail) into the
   * canonical {@link MediaApiResponse} shape. Default = identity.
   */
  parseRootResponse?(raw: unknown): MediaApiResponse;
  /**
   * Build query params for the single-media detail fetch (`openEditor`).
   * @example
   * // Camomilla: { language_code: 'it' }
   */
  buildDetailParams?(ctx: { lang?: string }): Record<string, unknown>;
  /**
   * Map a canonical folder (`{ name, parent }`) to the backend's create/update
   * payload.
   * @example
   * // Camomilla: { title, slug: slugify(title), updir: parent }
   */
  buildFolderPayload?(folder: Partial<MediaFolder>): Record<string, unknown>;
  /**
   * Build the PATCH payload for a media metadata update.
   * Default: `{ title, alt_text, description, translations }`.
   */
  buildMediaPatchPayload?(media: MediaItem): Record<string, unknown>;
  /**
   * Build the multipart PATCH payload for a file replacement.
   * @example
   * // Default REST: { file, maintain_url } — Camomilla: { file, same_url }
   */
  buildReplaceFilePayload?(
    file: File,
    maintainUrl: boolean,
  ): Record<string, unknown>;
}

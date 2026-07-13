import type {
  MediaAdapter,
  MediaApiResponse,
  MediaFolder,
  MediaItem,
  MediaListParamsContext,
} from "../types/media.js";

/**
 * Default media adapter — plain REST semantics.
 *
 * - List/detail params: passes `page`, `search`, `all`, and `mime` as-is.
 * - Response: assumes the backend already returns the canonical
 *   `{ media: { items, paginator }, folders, parent_folder }` shape.
 * - Detail params: passes `language_code` when a language is active.
 *
 * Integrations override any subset of these via their own `$mapoMediaAdapter`
 * plugin (see `@mapomodule/mapo-integrations-camomilla`).
 */
export const defaultMediaAdapter: Required<MediaAdapter> = {
  buildListParams(ctx: MediaListParamsContext): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (ctx.page != null) params.page = ctx.page;
    if (ctx.search) params.search = ctx.search;
    if (ctx.all) params.all = true;
    if (ctx.mime) params.mime = ctx.mime;
    return params;
  },

  parseRootResponse(raw: unknown): MediaApiResponse {
    return raw as MediaApiResponse;
  },

  buildDetailParams(ctx: { lang?: string }): Record<string, unknown> {
    return ctx.lang ? { language_code: ctx.lang } : {};
  },

  buildFolderPayload(folder: Partial<MediaFolder>): Record<string, unknown> {
    return { ...folder };
  },

  buildMediaPatchPayload(media: MediaItem): Record<string, unknown> {
    return {
      title: media.title,
      alt_text: media.alt_text,
      description: media.description,
      translations: media.translations,
    };
  },

  buildReplaceFilePayload(
    file: File,
    maintainUrl: boolean,
  ): Record<string, unknown> {
    return { file, maintain_url: maintainUrl };
  },
};

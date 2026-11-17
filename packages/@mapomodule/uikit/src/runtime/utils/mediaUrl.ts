import type { MediaItem } from "../types/media.js";

type VersionedMedia = Pick<MediaItem, "file"> &
  Partial<Pick<MediaItem, "modified" | "created">>;

/**
 * The URL to load a media file from in the backoffice: `file`, with
 * `v=<modified, else created>` appended, so a file replaced at the same URL
 * ("Keep current URL") is fetched again instead of served from the browser
 * cache. Camomilla's `created` changes on every save, a replacement included.
 *
 * The URL is left as it is when it already has a query string (a signed URL
 * would stop matching its signature), when it is a `data:` or `blob:` URL, and
 * when the media carries no date. Display only: the stored `file` never
 * changes.
 */
export function mediaFileUrl(media: VersionedMedia): string {
  const url = media.file ?? "";
  const version = media.modified || media.created;
  if (!url || !version) return url;

  const isInline = /^(data|blob):/i.test(url);
  const hasQuery = url.includes("?");
  if (isInline || hasQuery) return url;

  const hashAt = url.indexOf("#");
  const path = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  return `${path}?v=${encodeURIComponent(version)}${hash}`;
}

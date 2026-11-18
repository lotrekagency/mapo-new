import type { MediaFolder } from "../types/media.js";

/**
 * Data type of every drag started inside the media manager: a gallery card,
 * the bulk selection, a folder of the tree. Drop zones for files from the
 * computer ignore it, since Chrome reports an image dragged from the page as
 * "Files" too.
 */
export const MEDIA_DRAG_TYPE = "application/x-mapo-media-drag";

/** What is being dragged inside the media manager. */
export type MediaDrag =
  | { kind: "media"; ids: number[] }
  | { kind: "folder"; folder: MediaFolder };

/** Whether `event` drags something from inside the media manager. */
export function isMediaDrag(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes(MEDIA_DRAG_TYPE);
}

/** Starts dragging `drag`: the data type that marks it, and a move. */
export function startMediaDrag(event: DragEvent, drag: MediaDrag): void {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  // Firefox starts a drag only once some data is set.
  transfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(drag));
  transfer.effectAllowed = "move";
}

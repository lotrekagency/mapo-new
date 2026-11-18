import { folderWriteError, updateFolder } from "../media/_store";

// Update folder: PUT /api/media-folders/:id/ — the media store saves an
// existing folder (a rename, a move) through `updateOrCreate`, which sends a
// PUT. A move inside the folder itself or one of its subfolders is refused
// with a field error, as DRF would.
export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const body = await readBody(event);
  const error = folderWriteError(id, body);
  if (error) {
    setResponseStatus(event, 400);
    return { parent: [error] };
  }
  const updated = updateFolder(id, body);
  if (!updated)
    throw createError({ statusCode: 404, message: "Folder not found" });
  return updated;
});

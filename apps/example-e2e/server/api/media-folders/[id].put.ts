import { updateFolder } from "../media/_store";

// Update folder: PUT /api/media-folders/:id/ — the media store saves an
// existing folder (a rename) through `updateOrCreate`, which sends a PUT.
export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const body = await readBody(event);
  const updated = updateFolder(id, body);
  if (!updated)
    throw createError({ statusCode: 404, message: "Folder not found" });
  return updated;
});

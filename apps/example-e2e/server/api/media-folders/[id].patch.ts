import { updateFolder } from "../media/_store";

// Update folder: PATCH /api/media-folders/:id/
export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const body = await readBody(event);
  const updated = updateFolder(id, body);
  if (!updated)
    throw createError({ statusCode: 404, message: "Folder not found" });
  return updated;
});

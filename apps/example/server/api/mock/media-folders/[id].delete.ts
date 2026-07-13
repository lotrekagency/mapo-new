import { removeFolder } from "../media/_store";

// Delete folder: DELETE /api/media-folders/:id/
export default defineEventHandler((event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const ok = removeFolder(id);
  if (!ok) throw createError({ statusCode: 404, message: "Folder not found" });
  setResponseStatus(event, 204);
  return null;
});

import { folderWriteError, updateFolder } from "../media/_store";

// Update folder: PATCH /api/media-folders/:id/ — same rules as the PUT.
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

import { readMediaWrite, updateMediaItem, validateMediaWrite } from "./_store";

// Metadata update (JSON) or file replacement (multipart): PATCH /api/media/:id/
export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const { data, file } = await readMediaWrite(event);
  const errors = validateMediaWrite(data);
  if (errors) {
    setResponseStatus(event, 400);
    return errors;
  }
  const updated = updateMediaItem(id, data, file);
  if (!updated)
    throw createError({ statusCode: 404, message: "Media not found" });
  return updated;
});

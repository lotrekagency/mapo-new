import { updateMediaItem } from "./_store";

export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const body = await readBody(event);
  const updated = updateMediaItem(id, body);
  if (!updated)
    throw createError({ statusCode: 404, message: "Media not found" });
  return updated;
});

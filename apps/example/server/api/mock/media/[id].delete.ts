import { deleteMediaItem } from "./_store";

export default defineEventHandler((event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const ok = deleteMediaItem(id);
  if (!ok) throw createError({ statusCode: 404, message: "Media not found" });
  setResponseStatus(event, 204);
  return null;
});

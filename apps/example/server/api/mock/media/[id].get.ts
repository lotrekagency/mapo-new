import { mockMediaItems } from "./_store";

export default defineEventHandler((event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  const item = mockMediaItems.find((m) => m.id === id);
  if (!item) throw createError({ statusCode: 404, message: "Media not found" });
  return item;
});

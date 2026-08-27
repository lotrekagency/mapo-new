import { findMenu } from "./_store";

// GET /api/mock/menus/:id → full menu with its per-language node trees
export default defineEventHandler((event) => {
  const menu = findMenu(getRouterParam(event, "id") ?? "");
  if (!menu) throw createError({ statusCode: 404, message: "Menu not found" });
  return menu;
});

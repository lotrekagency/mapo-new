import { getMenu } from "../../utils/menuDb";

export default defineEventHandler((event) => {
  const menu = getMenu(getRouterParam(event, "id") ?? "");
  if (!menu) throw createError({ statusCode: 404, message: "Menu not found" });
  return menu;
});

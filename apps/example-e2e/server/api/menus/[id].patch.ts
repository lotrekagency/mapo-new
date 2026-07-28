import { getMenu, saveMenu } from "../../utils/menuDb";

// Partial update — exercised by the `use-patch` scenario, which sends only the
// keys that changed.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  if (!getMenu(id))
    throw createError({ statusCode: 404, message: "Menu not found" });
  return saveMenu(id, await readBody(event));
});

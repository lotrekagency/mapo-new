import { createMenu } from "./_store";

// POST /api/mock/menus → create a menu
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  setResponseStatus(event, 201);
  return createMenu(body);
});

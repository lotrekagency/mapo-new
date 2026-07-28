import { mockPagesByType } from "../_store";

// GET /api/mock/menus/page_types/:id → routable pages of that content type
export default defineEventHandler((event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  return mockPagesByType[id] ?? [];
});

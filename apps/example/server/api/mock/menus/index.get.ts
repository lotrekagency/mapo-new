import { mockMenus } from "./_store";

// GET /api/mock/menus → paginated menu list (MapoList contract)
export default defineEventHandler(() => ({
  count: mockMenus.length,
  next: null,
  previous: null,
  results: mockMenus.map(({ id, key, enabled }) => ({ id, key, enabled })),
}));

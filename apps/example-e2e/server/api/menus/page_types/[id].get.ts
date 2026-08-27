import { pagesByType } from "../../../utils/menuDb";

// Routable pages of a given content type.
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id") ?? 0);
  return pagesByType[id] ?? [];
});

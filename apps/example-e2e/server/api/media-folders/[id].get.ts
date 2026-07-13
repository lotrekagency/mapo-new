import { getExplorer, parseMimeFilter } from "../media/_store";

// Folder explorer: GET /api/media-folders/:id/ → { media, folders, parent_folder }
export default defineEventHandler((event) => {
  const query = getQuery(event);
  const id = parseInt(getRouterParam(event, "id") ?? "0", 10);
  return getExplorer({
    page: parseInt(String(query.page ?? "1"), 10),
    folder: id,
    search: query.search ? String(query.search) : undefined,
    mime: parseMimeFilter(query),
  });
});

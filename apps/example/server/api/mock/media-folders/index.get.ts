import { getExplorer, parseMimeFilter } from "../media/_store";

// Root explorer: GET /api/media-folders/ → { media, folders, parent_folder: null }
export default defineEventHandler((event) => {
  const query = getQuery(event);
  return getExplorer({
    page: parseInt(String(query.page ?? "1"), 10),
    folder: null,
    search: query.search ? String(query.search) : undefined,
    mime: parseMimeFilter(query),
  });
});

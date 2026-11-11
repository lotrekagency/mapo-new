import { defineEventHandler, getQuery } from "h3";
import { listPages, requirePagePermission } from "../../utils/pages";

// The pages, as a paginated DRF list, by `search`.
export default defineEventHandler((event) => {
  requirePagePermission(event, "view");
  const { search } = getQuery(event);
  return listPages(typeof search === "string" ? search : "");
});

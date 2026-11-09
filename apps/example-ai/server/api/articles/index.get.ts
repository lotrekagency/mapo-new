import { defineEventHandler, getQuery } from "h3";
import { listArticles, requireArticlePermission } from "../../utils/articles";

// The articles, as a paginated DRF list, by `search`.
export default defineEventHandler((event) => {
  requireArticlePermission(event, "view");
  const { search } = getQuery(event);
  return listArticles(typeof search === "string" ? search : "");
});

import { defineEventHandler, getRouterParam } from "h3";
import { getArticle, requireArticlePermission } from "../../utils/articles";

export default defineEventHandler((event) => {
  requireArticlePermission(event, "view");
  return getArticle(Number(getRouterParam(event, "id")));
});

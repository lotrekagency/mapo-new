import { defineEventHandler, getRouterParam, readBody } from "h3";
import { requireArticlePermission, updateArticle } from "../../utils/articles";

export default defineEventHandler(async (event) => {
  requireArticlePermission(event, "change");
  const id = Number(getRouterParam(event, "id"));
  return updateArticle(id, await readBody(event), false);
});

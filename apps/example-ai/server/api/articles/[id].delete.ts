import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { deleteArticle, requireArticlePermission } from "../../utils/articles";

export default defineEventHandler((event) => {
  requireArticlePermission(event, "delete");
  deleteArticle(Number(getRouterParam(event, "id")));
  setResponseStatus(event, 204);
  return null;
});

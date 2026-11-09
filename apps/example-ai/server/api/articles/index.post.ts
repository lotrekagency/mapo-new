import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { createArticle, requireArticlePermission } from "../../utils/articles";

// A new article: 400 with the errors by field, as DRF answers.
export default defineEventHandler(async (event) => {
  requireArticlePermission(event, "add");
  const article = createArticle(await readBody(event));
  setResponseStatus(event, 201);
  return article;
});

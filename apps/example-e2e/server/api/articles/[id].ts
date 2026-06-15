import {
  getArticle,
  updateArticle,
  deleteArticle,
} from "../../utils/articleDb";

export default defineEventHandler(async (event) => {
  const method = event.method;
  const id = Number(getRouterParam(event, "id"));

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: "Invalid id" });
  }

  if (method === "GET") {
    const article = getArticle(id);
    if (!article)
      throw createError({
        statusCode: 404,
        data: { detail: "Article not found." },
      });
    return article;
  }

  if (method === "PATCH" || method === "PUT") {
    const body = await readBody(event);
    // Validate title if present in patch
    if ("title" in body && !body.title) {
      throw createError({
        statusCode: 400,
        data: { title: ["This field is required."] },
      });
    }
    const result = updateArticle(id, body);
    if (!result)
      throw createError({
        statusCode: 404,
        data: { detail: "Article not found." },
      });
    return result;
  }

  if (method === "DELETE") {
    const deleted = deleteArticle(id);
    if (!deleted)
      throw createError({
        statusCode: 404,
        data: { detail: "Article not found." },
      });
    setResponseStatus(event, 204);
    return null;
  }

  throw createError({ statusCode: 405, message: "Method not allowed" });
});

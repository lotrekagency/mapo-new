import { updateArticle } from "./_store";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const body = await readBody(event);
  const updated = updateArticle(id, body);
  if (!updated) {
    throw createError({ statusCode: 404, message: "Article not found" });
  }
  return updated;
});

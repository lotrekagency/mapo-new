import { articles } from "./_store";

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  if (!articles.has(id)) {
    throw createError({ statusCode: 404, message: "Article not found" });
  }
  articles.delete(id);
  return null;
});

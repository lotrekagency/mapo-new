import { articles } from "./_store";

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  const article = articles.get(id);
  if (!article) {
    throw createError({ statusCode: 404, message: "Article not found" });
  }
  return article;
});

import { createArticle } from "./_store";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return createArticle(body);
});

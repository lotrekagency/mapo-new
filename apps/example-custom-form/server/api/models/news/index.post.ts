import { defineEventHandler, readBody } from "h3";
import { requireUser } from "../../../utils/session";
import { newsStore, type News } from "../../../utils/news-store";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody<Partial<News>>(event);
  return newsStore.create(body ?? {});
});

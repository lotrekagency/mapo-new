import { defineEventHandler, getRouterParam, readBody, createError } from "h3";
import { requireUser } from "../../../utils/session";
import { newsStore, type News } from "../../../utils/news-store";

export default defineEventHandler(async (event) => {
  requireUser(event);
  const id = Number(getRouterParam(event, "id"));
  const body = await readBody<Partial<News>>(event);
  const updated = newsStore.update(id, body ?? {});
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  return updated;
});

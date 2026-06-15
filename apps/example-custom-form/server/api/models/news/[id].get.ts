import { defineEventHandler, getRouterParam, createError } from "h3";
import { requireUser } from "../../../utils/session";
import { newsStore } from "../../../utils/news-store";

export default defineEventHandler((event) => {
  requireUser(event);
  const id = Number(getRouterParam(event, "id"));
  const item = newsStore.get(id);
  if (!item) throw createError({ statusCode: 404, statusMessage: "Not found" });
  return item;
});

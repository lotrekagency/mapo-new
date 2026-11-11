import { defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePagePermission, updatePage } from "../../utils/pages";

export default defineEventHandler(async (event) => {
  requirePagePermission(event, "change");
  const id = Number(getRouterParam(event, "id"));
  return updatePage(id, await readBody(event), false);
});

import { defineEventHandler, getRouterParam } from "h3";
import { getPage, requirePagePermission } from "../../utils/pages";

export default defineEventHandler((event) => {
  requirePagePermission(event, "view");
  return getPage(Number(getRouterParam(event, "id")));
});

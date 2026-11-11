import { defineEventHandler, getRouterParam } from "h3";
import { getCityEvent, requireEventPermission } from "../../utils/events";

export default defineEventHandler((event) => {
  requireEventPermission(event, "view");
  return getCityEvent(Number(getRouterParam(event, "id")));
});

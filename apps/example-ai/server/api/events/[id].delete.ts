import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { deleteCityEvent, requireEventPermission } from "../../utils/events";

export default defineEventHandler((event) => {
  requireEventPermission(event, "delete");
  deleteCityEvent(Number(getRouterParam(event, "id")));
  setResponseStatus(event, 204);
  return null;
});

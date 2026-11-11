import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { deletePage, requirePagePermission } from "../../utils/pages";

export default defineEventHandler((event) => {
  requirePagePermission(event, "delete");
  deletePage(Number(getRouterParam(event, "id")));
  setResponseStatus(event, 204);
  return null;
});

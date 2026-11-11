import { defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePagePermission, updatePage } from "../../utils/pages";

// The fields a save changed: MapoDetail sends a PATCH with them.
export default defineEventHandler(async (event) => {
  requirePagePermission(event, "change");
  const id = Number(getRouterParam(event, "id"));
  return updatePage(id, await readBody(event), true);
});

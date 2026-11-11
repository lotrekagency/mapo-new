import { defineEventHandler, getRouterParam, readBody } from "h3";
import { requireEventPermission, updateCityEvent } from "../../utils/events";

// The fields a save changed: MapoDetail sends a PATCH with them.
export default defineEventHandler(async (event) => {
  requireEventPermission(event, "change");
  const id = Number(getRouterParam(event, "id"));
  return updateCityEvent(id, await readBody(event), true);
});

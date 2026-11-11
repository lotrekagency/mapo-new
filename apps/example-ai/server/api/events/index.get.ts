import { defineEventHandler, getQuery } from "h3";
import { listCityEvents, requireEventPermission } from "../../utils/events";

// The events, as a paginated DRF list, by `search`.
export default defineEventHandler((event) => {
  requireEventPermission(event, "view");
  const { search } = getQuery(event);
  return listCityEvents(typeof search === "string" ? search : "");
});

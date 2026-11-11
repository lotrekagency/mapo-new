import { defineEventHandler, getQuery } from "h3";
import { listVenues } from "../../utils/venues";

// The venues of the events, as a paginated DRF list, by `search`.
export default defineEventHandler((event) => {
  const { search } = getQuery(event);
  return listVenues(event, typeof search === "string" ? search : "");
});

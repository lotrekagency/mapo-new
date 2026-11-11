import { defineEventHandler, getQuery } from "h3";
import { listPeople } from "../../utils/people";

// The people the speakers of an event point to, a page at a time, by
// `search`.
export default defineEventHandler((event) => {
  const { search, page } = getQuery(event);
  const number = Number.parseInt(String(page ?? ""), 10);
  return listPeople(
    event,
    typeof search === "string" ? search : "",
    Number.isInteger(number) && number > 0 ? number : 1,
  );
});

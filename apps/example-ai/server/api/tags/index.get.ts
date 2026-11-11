import { defineEventHandler, getQuery } from "h3";
import { listTags } from "../../utils/tags";

// The tags of the articles, a page at a time, by `search`.
export default defineEventHandler((event) => {
  const { search, page } = getQuery(event);
  const number = Number.parseInt(String(page ?? ""), 10);
  return listTags(
    event,
    typeof search === "string" ? search : "",
    Number.isInteger(number) && number > 0 ? number : 1,
  );
});

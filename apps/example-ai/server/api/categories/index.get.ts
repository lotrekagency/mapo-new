import { defineEventHandler, getQuery } from "h3";
import { listCategories } from "../../utils/categories";

// The categories of the articles, as a paginated DRF list, by `search`.
export default defineEventHandler((event) => {
  const { search } = getQuery(event);
  return listCategories(event, typeof search === "string" ? search : "");
});

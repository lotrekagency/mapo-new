import { getCategories } from "../../utils/articleDb";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const search = query.search as string | undefined;
  return getCategories(search);
});

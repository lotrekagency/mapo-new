import { getTopics } from "../../utils/articleDb";

export default defineEventHandler((event) => {
  const { search } = getQuery(event) as { search?: string };
  return getTopics(search);
});

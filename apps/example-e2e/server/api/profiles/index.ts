import { getProfiles } from "../../utils/articleDb";

export default defineEventHandler((event) => {
  const { search } = getQuery(event) as { search?: string };
  return getProfiles(search);
});

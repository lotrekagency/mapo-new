import { listReviewers } from "../../utils/reviewers";

// The editorial office's reviewers, all in one list, with `?search=` on the
// email and the name.
export default defineEventHandler((event) => {
  const query = getQuery(event);
  const search = typeof query.search === "string" ? query.search : "";
  return listReviewers(search);
});

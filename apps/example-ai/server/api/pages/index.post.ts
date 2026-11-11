import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { createPage, requirePagePermission } from "../../utils/pages";

// A new page: 400 with the errors by field, as DRF answers.
export default defineEventHandler(async (event) => {
  requirePagePermission(event, "add");
  const page = createPage(await readBody(event));
  setResponseStatus(event, 201);
  return page;
});

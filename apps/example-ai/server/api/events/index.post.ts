import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { createCityEvent, requireEventPermission } from "../../utils/events";

// A new event: 400 with the errors by field, as DRF answers. The import
// page (app/pages/events/import.vue) creates the events it found here, one
// request each, once the operator confirms.
export default defineEventHandler(async (event) => {
  requireEventPermission(event, "add");
  const created = createCityEvent(await readBody(event));
  setResponseStatus(event, 201);
  return created;
});

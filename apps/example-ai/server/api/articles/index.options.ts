import { defineEventHandler } from "h3";
import { articleMetadata } from "../../utils/articles";
import { requireUser } from "../../utils/session";

// DRF's standard metadata of the article serializer: MapoDetail asks it once
// per page, and Magic Fill sends it to the AI with the form's fields.
export default defineEventHandler((event) => {
  requireUser(event);
  return articleMetadata();
});

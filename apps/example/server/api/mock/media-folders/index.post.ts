import { addFolder } from "../media/_store";

// Create folder: POST /api/media-folders/
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const folder = addFolder(body);
  setResponseStatus(event, 201);
  return folder;
});

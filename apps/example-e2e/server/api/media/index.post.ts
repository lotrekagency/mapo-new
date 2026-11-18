import { addMediaItem, readMediaWrite, validateMediaWrite } from "./_store";

// Upload: POST /api/media/ with Mapo's multipart envelope (or plain JSON).
export default defineEventHandler(async (event) => {
  const { data, file } = await readMediaWrite(event);
  const errors = validateMediaWrite(data);
  if (errors) {
    setResponseStatus(event, 400);
    return errors;
  }
  const item = addMediaItem(data, file);
  setResponseStatus(event, 201);
  return item;
});

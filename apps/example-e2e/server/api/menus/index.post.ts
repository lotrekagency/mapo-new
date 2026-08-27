import { createMenu } from "../../utils/menuDb";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  setResponseStatus(event, 201);
  return createMenu(body);
});

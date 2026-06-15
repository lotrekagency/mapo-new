import { defineEventHandler, readBody, createError } from "h3";
import { login } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event);
  if (!body?.username || !body?.password) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing credentials",
    });
  }
  return login(event);
});

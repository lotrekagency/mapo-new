import { defineEventHandler } from "h3";
import { logout } from "../../utils/session";

export default defineEventHandler((event) => {
  logout(event);
  return { ok: true };
});

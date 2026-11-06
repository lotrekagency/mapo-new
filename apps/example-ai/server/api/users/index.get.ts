import { defineEventHandler, getQuery } from "h3";
import { listUsers, requireUser } from "../../utils/session";

// The users, as a DRF backend lists them, for the AI settings page
// (mapo.ai.settings.usersApi in nuxt.config.ts): signed-in users only.
export default defineEventHandler((event) => {
  requireUser(event);
  const { search } = getQuery(event);
  return listUsers(typeof search === "string" ? search : "");
});

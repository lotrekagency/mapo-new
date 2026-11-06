import { defineEventHandler, getQuery } from "h3";
import { listGroups, requireUser } from "../../utils/session";

// The groups, as a DRF backend lists them, for the AI settings page
// (mapo.ai.settings.groupsApi in nuxt.config.ts): signed-in users only.
export default defineEventHandler((event) => {
  requireUser(event);
  const { search } = getQuery(event);
  return listGroups(typeof search === "string" ? search : "");
});

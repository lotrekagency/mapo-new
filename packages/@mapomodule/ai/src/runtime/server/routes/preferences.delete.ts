import { defineEventHandler, sendNoContent } from "h3";
import { requireMapoAiSession } from "../auth/nitro";
import { removePreference } from "../settings/preferences";
import { useMapoAiStorage } from "../storage/nitro";

/**
 * `DELETE /_mapo/ai/preferences`: removes the user's preference, so the
 * app's default applies again. 204, whether there was one or not.
 */
export default defineEventHandler(async (event) => {
  const session = await requireMapoAiSession(event);
  await removePreference(
    useMapoAiStorage(event).store("settings"),
    session.user.id,
  );
  return sendNoContent(event);
});

import { createError, defineEventHandler, sendNoContent } from "h3";
import { requireMapoAiSession } from "../auth/nitro";
import { readJsonBody } from "../body";
import { mapoAiUserPolicy } from "../run/nitro";
import { readPreferenceInput, savePreference } from "../settings/preferences";
import { useMapoAiStorage } from "../storage/nitro";

/**
 * `PUT /_mapo/ai/preferences`: saves the provider and model the user
 * prefers, `{ provider, model }`, sealed in their space of the storage.
 * It becomes their default for `run` while the app and the admins give it
 * to them. 403 for a provider or a model the user is not given; 503 when
 * the storage is closed. 204.
 */
export default defineEventHandler(async (event) => {
  const session = await requireMapoAiSession(event);
  const storage = useMapoAiStorage(event);
  const preference = readPreferenceInput(await readJsonBody(event, 4096));
  const policy = await mapoAiUserPolicy(event, session.user);
  const usable = policy.providers.find(
    (one) => one.provider.id === preference.provider,
  );
  if (!usable?.models.includes(preference.model)) {
    throw createError({
      statusCode: 403,
      statusMessage: "This AI provider or model is not given to you",
    });
  }
  await savePreference(
    storage.store("settings"),
    session.user.id,
    preference,
    new Date().toISOString(),
  );
  return sendNoContent(event);
});

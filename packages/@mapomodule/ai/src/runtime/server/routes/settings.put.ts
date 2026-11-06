import { createError, defineEventHandler, setResponseHeader } from "h3";
import type { MapoAiSettingsAnswer } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { readJsonBody } from "../body";
import { actorOf, auditKeyAction } from "../keys/nitro";
import {
  mapoAiAppProviders,
  mapoAiRunOptions,
  mapoAiUserPolicy,
} from "../run/nitro";
import type { MapoAiRunOptions } from "../run/options";
import { canCall } from "../run/policy";
import type { MapoAiPolicy } from "../run/policy";
import {
  SETTINGS_BODY_BYTES,
  modelsToCheck,
  readSettingsInput,
  settingsAnswer,
  withSettingsInput,
} from "../settings/admin";
import { listedModels } from "../settings/connection";
import { changeAdminSettings, readAdminSettings } from "../settings/store";
import { useMapoAiStorage } from "../storage/nitro";

/**
 * `PUT /_mapo/ai/settings`, for the AI's admins: each block the body holds
 * (`instructions`, `verification`, `secretWords`, `providers`) replaces
 * theirs; the others stay. A model they add is saved only where the app
 * allows it (`adminModels`) and once the provider's server lists it, asked
 * with the key the admin's own calls use, at no cost. The audit keeps who
 * changed which blocks and which rules of verification they made less
 * prudent than the app's or Mapo's defaults, never the instructions. It answers the
 * settings as `GET` does. 400 for a body that is not a change, 403 for what
 * the app keeps from the admins, 422 for a model the server does not list
 * or cannot be asked about, 502 when the list cannot be read, 503 when the
 * storage is closed.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiSettingsAnswer> => {
    setResponseHeader(event, "cache-control", "no-store");
    const session = await requireMapoAiAdmin(event);
    const storage = useMapoAiStorage(event);
    const store = storage.store("settings");
    const input = readSettingsInput(
      await readJsonBody(event, SETTINGS_BODY_BYTES),
    );
    const options = mapoAiRunOptions(event);
    const checks = modelsToCheck(await readAdminSettings(store), input);
    if (checks.size) {
      const policy = await mapoAiUserPolicy(event, session.user);
      for (const [id, models] of checks) {
        await requireListed(policy, options, id, models);
      }
    }
    const by = actorOf(session.user);
    const change = await changeAdminSettings(store, (record) => {
      const result = withSettingsInput(record, input, options, {
        at: new Date().toISOString(),
        by,
      });
      return { record: result.record, result };
    });
    await auditKeyAction(event, storage.store("audit"), {
      by,
      action: "settings-saved",
      blocks: change.blocks,
      ...(change.providers.length ? { providers: change.providers } : {}),
      ...(change.loosened.length ? { loosened: change.loosened } : {}),
    });
    return settingsAnswer(options, change.record, mapoAiAppProviders(event));
  },
);

/**
 * Refuses a model an admin adds unless the app allows it and the
 * provider's server lists it, asked as the admin's own calls ask it.
 */
async function requireListed(
  policy: MapoAiPolicy,
  options: MapoAiRunOptions,
  id: string,
  models: readonly string[],
): Promise<void> {
  const enabled = Object.hasOwn(options.providers, id)
    ? options.providers[id]
    : undefined;
  if (enabled?.adminModels !== true) {
    throw createError({
      statusCode: 403,
      statusMessage: "The app lets no admin add models to this provider",
    });
  }
  const usable = policy.providers.find((one) => one.provider.id === id);
  if (!usable || !canCall(usable)) {
    throw createError({
      statusCode: 422,
      statusMessage:
        "The provider's models cannot be listed: it is not given to you, or no key reaches you for it",
    });
  }
  const listed = await listedModels(usable, "list of models", {
    log: (message) => console.warn(message),
  });
  if (listed === undefined) {
    throw createError({
      statusCode: 422,
      statusMessage: "This provider cannot list its models",
    });
  }
  if ("failure" in listed) {
    throw createError({
      statusCode: 502,
      statusMessage: "The provider's list of models could not be read",
      data: { failure: listed.failure },
    });
  }
  const missing = models.find((model) => !listed.ids.includes(model));
  if (missing !== undefined) {
    throw createError({
      statusCode: 422,
      statusMessage: "The provider's server does not list this model",
      data: { model: missing },
    });
  }
}

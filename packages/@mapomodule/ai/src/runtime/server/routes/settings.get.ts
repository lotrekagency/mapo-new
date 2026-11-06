import { defineEventHandler, setResponseHeader } from "h3";
import type { MapoAiSettingsAnswer } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { mapoAiAppProviders, mapoAiRunOptions } from "../run/nitro";
import { settingsAnswer } from "../settings/admin";
import { readAdminSettings } from "../settings/store";
import { useMapoAiStorage } from "../storage/nitro";

/**
 * `GET /_mapo/ai/settings`, for the AI's admins: how the AI works in the
 * whole app. Their instructions, rules of verification, words of secrets
 * and the settings of each provider (the prompt cache, Anthropic's
 * fallbacks, the models they added), beside what the app sets and what
 * Mapo keeps. Never a key. 503 when the storage is closed.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiSettingsAnswer> => {
    setResponseHeader(event, "cache-control", "no-store");
    await requireMapoAiAdmin(event);
    const store = useMapoAiStorage(event).store("settings");
    const record = await readAdminSettings(store);
    return settingsAnswer(
      mapoAiRunOptions(event),
      record,
      mapoAiAppProviders(event),
    );
  },
);

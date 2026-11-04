import { defineNitroPlugin } from "nitropack/runtime";
import type { H3Event } from "h3";
import {
  MAPO_AI_RESERVED_PROVIDER_IDS,
  registeredMapoAiProviders,
} from "../providers/registry";
import { mapoAiRunOptions, unusableMapoAiProviders } from "../run/nitro";

/**
 * Says in the log, when the server starts, which providers `run` will not
 * call: one `mapo.ai.providers` enables that does not exist or has no
 * model, and one the app registers that `mapo.ai.providers` does not
 * enable. Registering a provider makes it available; only the options make
 * it usable.
 *
 * It runs once the app's own plugins have run (Nitro runs the plugins of
 * modules first), because those register the app's providers. Where the
 * runtime allows no timer while the server starts, as on Cloudflare
 * Workers, it runs at the first request.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return;

  let starting: ReturnType<typeof setTimeout>;
  try {
    starting = setTimeout(() => check(), 0);
  } catch {
    const unhook = nitroApp.hooks.hook("request", (event) => {
      unhook();
      check(event);
    });
    return;
  }
  nitroApp.hooks.hook("close", () => clearTimeout(starting));
});

function check(event?: H3Event): void {
  for (const { id, reason } of unusableMapoAiProviders(event)) {
    console.error(notice(id, reason));
  }
  const enabled = mapoAiRunOptions(event).providers;
  for (const id of registeredMapoAiProviders()) {
    if (Object.hasOwn(enabled, id)) continue;
    console.warn(
      `[mapo-ai] The provider "${id}" is registered, but mapo.ai.providers does not enable it: run never calls it.`,
    );
  }
}

function notice(id: string, reason: "unknown" | "no-model"): string {
  if (reason === "no-model") {
    return `[mapo-ai] The provider "${id}" has no model to call: list them in mapo.ai.providers.${id}.models. run does not call it.`;
  }
  const isMapos = MAPO_AI_RESERVED_PROVIDER_IDS.includes(id);
  const fix = isMapos
    ? "this version of Mapo has no such provider"
    : "register it with registerMapoAiProvider() in a Nitro plugin";
  return `[mapo-ai] mapo.ai.providers enables "${id}", but there is no provider "${id}": ${fix}. run does not call it.`;
}

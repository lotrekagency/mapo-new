import { defineNitroPlugin } from "nitropack/runtime";
import type { H3Event } from "h3";
import { isRecord } from "../../shared/guards";
import {
  MAPO_AI_RESERVED_PROVIDER_IDS,
  registeredMapoAiProviders,
} from "../providers/registry";
import {
  mapoAiPolicy,
  mapoAiRunOptions,
  unusableMapoAiProviders,
} from "../run/nitro";

/** How long the server waits for a provider's list of models when it starts. */
const LIST_TIMEOUT_MS = 10_000;

/**
 * Says in the log, when the server starts, which providers `run` will not
 * call: one `mapo.ai.providers` enables that does not exist or has no
 * model, and one the app registers that `mapo.ai.providers` does not
 * enable. Registering a provider makes it available; only the options make
 * it usable. For a provider whose server lists its models, as the local
 * ones do, it also says which models the options allow that the server
 * does not have, or that the server cannot be reached; neither stops the
 * server from starting.
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
  checkModels(event).catch((error: unknown) => {
    console.warn(
      `[mapo-ai] The models of the providers could not be checked: ${describe(error)}`,
    );
  });
}

/**
 * Compares the models `mapo.ai.providers` allows with those each provider's
 * server lists, when it lists them. A model's name is compared as the
 * provider lists it.
 */
async function checkModels(event?: H3Event): Promise<void> {
  const { providers } = mapoAiPolicy(event);
  await Promise.all(
    providers.map(async ({ provider, models }) => {
      if (typeof provider.listModels !== "function") return;
      let listed: unknown;
      try {
        listed = await provider.listModels(
          AbortSignal.timeout(LIST_TIMEOUT_MS),
        );
      } catch (error) {
        console.warn(
          `[mapo-ai] The models of the provider "${provider.id}" could not be read: ${describe(error)}. run fails until its server answers.`,
        );
        return;
      }
      // An app's provider may list anything: only ids count.
      const ids = new Set(
        (Array.isArray(listed) ? listed : [])
          .map((info) => (isRecord(info) ? info.id : undefined))
          .filter((id): id is string => typeof id === "string"),
      );
      const missing = models.filter((model) => !ids.has(model));
      if (!missing.length) return;
      const names = missing.map((model) => `"${model}"`).join(", ");
      console.warn(
        `[mapo-ai] The provider "${provider.id}" does not list ${names}, which mapo.ai.providers.${provider.id}.models allows: a request for ${missing.length > 1 ? "them" : "it"} fails until its server has ${missing.length > 1 ? "them" : "it"}.`,
      );
    }),
  );
}

/** An error, for the log: one line, a few hundred characters at most. */
function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 300);
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

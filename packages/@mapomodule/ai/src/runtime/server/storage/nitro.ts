/**
 * The sealed storage wired to the app's Nitro server: the `mapo-ai` mount
 * and the secret of `runtimeConfig.mapoAi`. The logic lives in `sealed.ts`
 * and `secret.ts`, which the tests run without Nitro.
 */

import { createError } from "h3";
import type { H3Event } from "h3";
import { useRuntimeConfig, useStorage } from "nitropack/runtime";
import { MAPO_AI_STORAGE_MOUNT } from "../../shared/gateway";
import type { MapoAiStorageState } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { createSealedStorage } from "./sealed";
import type { SealedStorage, UnreadableReason } from "./sealed";
import { canSeal, readMapoAiSecret } from "./secret";
import type { MapoAiSecret } from "./secret";

/** What a warning says about a record that does not open. */
const UNREADABLE: Record<UnreadableReason, string> = {
  foreign: "it is not a record this module sealed",
  "other-key": "it was sealed with another secret, or for another purpose",
  tampered: "it was changed, or moved from another key",
};

/** Records warned about one by one in a run; past that, one line says there are more. */
const MAX_WARNINGS = 100;

let temporary: string | undefined;
let sealed: { secret: string; storage: SealedStorage } | undefined;
const warned = new Set<string>();

/**
 * The secret the storage seals with, from `runtimeConfig.mapoAi.secret`
 * (`NUXT_MAPO_AI_SECRET`). Pass the request's event where there is one: on
 * some runtimes, such as Cloudflare Workers, the environment arrives with
 * the request. A temporary secret is made once in a run, so every request
 * shares it.
 */
export function useMapoAiSecret(event?: H3Event): MapoAiSecret {
  const found = readMapoAiSecret(configuredSecret(event), {
    dev: import.meta.dev === true,
  });
  if (found.status !== "temporary") return found;
  temporary ??= found.secret;
  return { status: "temporary", secret: temporary };
}

/**
 * Whether a storage is mounted at `mapo-ai`. Without one, Nitro would keep
 * the records in the memory of one process, so the storage stays closed.
 */
export function hasMapoAiMount(): boolean {
  const { base } = useStorage().getMount(MAPO_AI_STORAGE_MOUNT);
  return base === `${MAPO_AI_STORAGE_MOUNT}:`;
}

/**
 * The module's sealed storage, for the gateway's routes. It is closed, and
 * the request fails with a 503, when the secret is missing or unusable or
 * nothing is mounted at `mapo-ai`; the server's log says why when it starts.
 * @param event the request's event, through which the secret is read
 * @throws H3Error 503 when the storage is closed
 */
export function useMapoAiStorage(event: H3Event): SealedStorage {
  const current = useMapoAiSecret(event);
  if (!canSeal(current) || !hasMapoAiMount()) {
    throw createError({
      statusCode: 503,
      statusMessage: "AI storage unavailable",
    });
  }
  const isSameSecret = sealed?.secret === current.secret;
  if (!sealed || !isSameSecret) {
    sealed = {
      secret: current.secret,
      storage: createSealedStorage({
        storage: useStorage(MAPO_AI_STORAGE_MOUNT),
        secret: current.secret,
        onUnreadable: warnOnce,
      }),
    };
  }
  return sealed.storage;
}

/**
 * The state of the storage, for the AI's admins: whether it is open, what
 * the secret is like (never its value), what is mounted at `mapo-ai`.
 * @param event the request's event, through which the secret is read
 */
export function mapoAiStorageState(event: H3Event): MapoAiStorageState {
  const secret = useMapoAiSecret(event);
  const mounted = hasMapoAiMount();
  const state: MapoAiStorageState = {
    open: canSeal(secret) && mounted,
    secret: secret.status,
    mounted,
  };
  const driver = mounted
    ? useStorage().getMount(MAPO_AI_STORAGE_MOUNT).driver.name
    : undefined;
  if (typeof driver === "string" && driver !== "") state.driver = driver;
  return state;
}

function configuredSecret(event?: H3Event): unknown {
  const config: unknown = useRuntimeConfig(event).mapoAi;
  return isRecord(config) ? config.secret : undefined;
}

/** One warning per record and reason in a run, however often it is read. */
function warnOnce(key: string, reason: UnreadableReason): void {
  const id = `${reason}:${key}`;
  if (warned.has(id) || warned.size > MAX_WARNINGS) return;
  warned.add(id);
  if (warned.size > MAX_WARNINGS) {
    console.warn(
      `[mapo-ai] More than ${MAX_WARNINGS} records cannot be read; the log names no more of them in this run.`,
    );
    return;
  }
  console.warn(
    `[mapo-ai] The record ${key} cannot be read: ${UNREADABLE[reason]}. It stays until it expires or is replaced.`,
  );
}

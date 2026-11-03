/**
 * The secret the module's storage seals with: `NUXT_MAPO_AI_SECRET`, read
 * at runtime into `runtimeConfig.mapoAi.secret`. Pure: `nitro.ts` passes the
 * runtime config in.
 */

import { MIN_SECRET_LENGTH, toHex } from "./sealed";

/**
 * The secret, as the server found it:
 * - `set`: the app's own, trimmed;
 * - `temporary`: none was set and the server runs in development, so it
 *   seals with a random secret made for this run, and the state lasts until
 *   the server restarts;
 * - `missing`, `too-short`, `not-text`: the storage stays closed, and no
 *   value is read or written. It never falls back to keeping the state in
 *   clear.
 */
export type MapoAiSecret =
  | { status: "set" | "temporary"; secret: string }
  | { status: "missing" | "too-short" | "not-text" };

/** What the server's log says about the secret when it starts. */
export interface SecretNotice {
  level: "warn" | "error";
  message: string;
}

/** Characters of the temporary secret: 32 random bytes, in hexadecimal. */
const TEMPORARY_BYTES = 32;

const HOW_TO_SET =
  "Set it in the server's environment, for example with: openssl rand -base64 32";

/**
 * Reads the secret from the runtime config, as outside data: the
 * environment can turn a value into a number or a boolean. Only a missing
 * secret gets a temporary one, and only in development; a secret that is set
 * but unusable closes the storage there too, so a mistake is never covered up.
 */
export function readMapoAiSecret(
  value: unknown,
  options: { dev: boolean },
): MapoAiSecret {
  const text = typeof value === "string" ? value.trim() : value;
  const isUnset = text === undefined;
  const isNull = text === null;
  const isEmpty = text === "";
  if (isUnset || isNull || isEmpty) {
    return options.dev
      ? { status: "temporary", secret: temporarySecret() }
      : { status: "missing" };
  }
  if (typeof text !== "string") return { status: "not-text" };
  if (text.length < MIN_SECRET_LENGTH) return { status: "too-short" };
  return { status: "set", secret: text };
}

/** Whether the storage can seal with `secret`: the app's own, or a temporary one. */
export function canSeal(
  secret: MapoAiSecret,
): secret is Extract<MapoAiSecret, { secret: string }> {
  return "secret" in secret;
}

/**
 * The line the server's log writes about the secret when it starts, or
 * `undefined` when the app's own secret is set. It never contains the secret.
 */
export function secretNotice(secret: MapoAiSecret): SecretNotice | undefined {
  switch (secret.status) {
    case "set":
      return undefined;
    case "temporary":
      return {
        level: "warn",
        message: `[mapo-ai] NUXT_MAPO_AI_SECRET is not set: this development server seals the AI state with a temporary secret, so the state is lost when it restarts. ${HOW_TO_SET}`,
      };
    case "missing":
      return {
        level: "error",
        message: `[mapo-ai] NUXT_MAPO_AI_SECRET is not set: the AI storage is closed, and no value is read or written until it is. ${HOW_TO_SET}`,
      };
    case "too-short":
      return {
        level: "error",
        message: `[mapo-ai] NUXT_MAPO_AI_SECRET is shorter than ${MIN_SECRET_LENGTH} characters: the AI storage is closed. ${HOW_TO_SET}`,
      };
    case "not-text":
      return {
        level: "error",
        message: `[mapo-ai] NUXT_MAPO_AI_SECRET is not text (the environment value reads as a number, a boolean or JSON): the AI storage is closed. ${HOW_TO_SET}`,
      };
  }
}

function temporarySecret(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(TEMPORARY_BYTES)));
}

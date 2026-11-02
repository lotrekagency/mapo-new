/**
 * The AI gateway contract: where its routes live, which version of the
 * contract they speak and what they answer. Pure TypeScript, shared by the
 * module and the server routes.
 */

/**
 * Path prefix of the gateway routes on the app's Nitro server. It stays
 * outside `/api/*`, so a backend integration that proxies `/api` to the real
 * backend never catches these routes.
 */
export const MAPO_AI_GATEWAY_PATH = "/_mapo/ai";

/**
 * Version of the gateway contract: the routes, their bodies and their
 * responses. It goes up when one of them changes in a way an older client
 * cannot read, including the format of a task contract carried in a body
 * (`AI_CONTRACT_FORMAT_VERSION`, `contract.ts`).
 */
export const MAPO_AI_CONTRACT_VERSION = 1;

/** Response of `GET /_mapo/ai/status`. */
export interface MapoAiStatus {
  /** The version of the gateway contract this server implements. */
  contract: number;
}

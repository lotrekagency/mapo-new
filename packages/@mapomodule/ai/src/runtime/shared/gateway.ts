/**
 * The AI gateway contract: where its routes live and keep their state, which
 * version of the contract they speak and what they answer. Pure TypeScript,
 * shared by the module and the server routes.
 */

/**
 * Path prefix of the gateway routes on the app's Nitro server. It stays
 * outside `/api/*`, so a backend integration that proxies `/api` to the real
 * backend never catches these routes.
 */
export const MAPO_AI_GATEWAY_PATH = "/_mapo/ai";

/**
 * The Nitro storage mount the gateway keeps its state in, every record
 * sealed (`runtime/server/storage/sealed.ts`). The app chooses its driver as
 * for any Nitro mount; without one the module mounts the file system.
 */
export const MAPO_AI_STORAGE_MOUNT = "mapo-ai";

/**
 * Version of the gateway contract: the routes, their bodies and their
 * responses. It goes up when one of them changes in a way an older client
 * cannot read, including the format of a task contract carried in a body
 * (`AI_CONTRACT_FORMAT_VERSION`, `contract.ts`).
 */
export const MAPO_AI_CONTRACT_VERSION = 2;

/**
 * Response of `GET /_mapo/ai/status`, for a signed-in user. Without a
 * session the route answers 401.
 */
export interface MapoAiStatus {
  /** The version of the gateway contract this server implements. */
  contract: number;
  /**
   * Whether the app's rules (`mapo.ai.users`, the `mapo-ai:user` hooks) let
   * the user use the AI. When `false`, the routes that act answer 403, and
   * the user administers nothing.
   */
  allowed: boolean;
  /** Whether the user administers the AI (`mapo.ai.admin`; superusers always). */
  admin: boolean;
  /** The state of the gateway's storage: for the AI's admins only. */
  storage?: MapoAiStorageState;
}

/**
 * The secret the storage seals with, as the server found it: `set` (the
 * app's own), `temporary` (none in development: a random one for this run),
 * or what keeps the storage closed.
 */
export type MapoAiSecretState =
  | "set"
  | "temporary"
  | "missing"
  | "too-short"
  | "not-text";

/** The state of the gateway's storage, as `status` reports it to the AI's admins. */
export interface MapoAiStorageState {
  /** Whether the gateway can read and write its state. */
  open: boolean;
  /** The secret, `NUXT_MAPO_AI_SECRET`: never its value. */
  secret: MapoAiSecretState;
  /** Whether a driver is mounted at `mapo-ai`. */
  mounted: boolean;
  /** The name of that driver, when it has one (`fs-lite`, `redis`…). */
  driver?: string;
}

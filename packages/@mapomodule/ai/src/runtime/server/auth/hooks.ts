/**
 * The Nitro hook the gateway calls for every authenticated request, typed
 * for the app's server code. The module adds this file to the app's server
 * types, so a Nitro plugin gets the hook's name and context checked.
 */

import type { MapoAiUserContext } from "./user";

/** The hooks of `@mapomodule/ai`, by name. */
interface MapoAiRuntimeHooks {
  /**
   * Called once the backend has returned the user and `mapo.ai.users` has
   * let them in, before the request goes on. Set `context.allowed` to
   * `false` to refuse the user: `status` answers `allowed: false`, every
   * other route 403. A later hook cannot undo the refusal.
   */
  "mapo-ai:user": (context: MapoAiUserContext) => void | Promise<void>;
}

declare module "nitropack/types" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface NitroRuntimeHooks extends MapoAiRuntimeHooks {}
}

declare module "nitropack" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface NitroRuntimeHooks extends MapoAiRuntimeHooks {}
}

export type { MapoAiRuntimeHooks };

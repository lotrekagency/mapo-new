/**
 * The Nitro hooks the gateway calls, typed for the app's server code: one
 * for every authenticated request, one for every prompt, one for every
 * file read. The module adds this file to the app's server types, so a
 * Nitro plugin gets the hooks' names and contexts checked.
 */

import type { MapoAiReadContext } from "../readers/types";
import type { MapoAiPromptContext } from "../run/run";
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
  /**
   * Called for every request of `run` the gateway lets in, before the AI
   * is called. Add the app's rules for this request with
   * `context.addRule()`: they follow `mapo.ai.instructions`, and Mapo's
   * base rules still win over them. A hook cannot remove a rule, nor
   * change the shape of the answer.
   */
  "mapo-ai:prompt": (context: MapoAiPromptContext) => void | Promise<void>;
  /**
   * Called for every file `read` reads, once its reader, Mapo's or the
   * app's, has read it, and before the page gets the text. Touch up what
   * was read through `context.parts`: change a part's text, remove parts,
   * add some. A hook that throws makes the file `failed`. It sees only
   * files: a text the page sends to `run` itself never goes through it.
   */
  "mapo-ai:read": (context: MapoAiReadContext) => void | Promise<void>;
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

/**
 * Public types for `@mapomodule/ai`.
 * Import from `@mapomodule/ai/types`, or from `mapomodule/types` in an app.
 */

import type { MapoAiAccessRule } from "./runtime/server/auth/user";

export type {
  MapoAiSecretState,
  MapoAiStatus,
  MapoAiStorageState,
} from "./runtime/shared/gateway";
export type {
  MapoAiAccessRule,
  MapoAiUser,
  MapoAiUserContext,
} from "./runtime/server/auth/user";
export type { MapoAiRuntimeHooks } from "./runtime/server/auth/hooks";

/**
 * Options of `@mapomodule/ai`: the `mapo.ai` key through the meta-module, or
 * `mapoAi` when the module is registered on its own.
 *
 * Setting the key installs the module and turns the gateway routes on. The
 * gateway knows the user from the backend session: it forwards the
 * request's cookie to `userInfoApi`, as core does when it renders a page.
 */
export interface MapoAiOptions {
  /**
   * Who administers the AI. Superusers always do; so does a user in one of
   * `groups`, or with one of `permissions` (codenames, as `userInfoApi`
   * sends them). Today an admin is told the state of the gateway's storage
   * in `status`.
   * @default {} (superusers only)
   * @example { groups: ["ai-admin"] }
   */
  admin?: MapoAiAccessRule;
  /**
   * Who may use the AI. Unset, every user `userInfoApi` returns may. Set,
   * only superusers, the AI's admins and the users the rule picks: in one
   * of `groups`, or with one of `permissions`. A Nitro plugin can narrow it
   * further with the `mapo-ai:user` hook, for a rule no group expresses.
   * @default undefined (every signed-in user)
   * @example { groups: ["editors"], permissions: ["change_article"] }
   */
  users?: MapoAiAccessRule;
}

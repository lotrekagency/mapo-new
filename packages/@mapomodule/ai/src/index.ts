/**
 * Public types for `@mapomodule/ai`.
 * Import from `@mapomodule/ai/types`, or from `mapomodule/types` in an app.
 */

export type { MapoAiStatus } from "./runtime/shared/gateway";

/**
 * Options of `@mapomodule/ai`: the `mapo.ai` key through the meta-module, or
 * `mapoAi` when the module is registered on its own.
 *
 * There are no options yet: setting the key installs the module and turns the
 * gateway routes on.
 */
// Empty on purpose: options are added with the behaviour they configure.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapoAiOptions {}

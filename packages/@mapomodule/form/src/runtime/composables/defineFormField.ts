import { useNuxtApp } from "#app";
import type {
  FieldComponentEntry,
  FieldAccessor,
  FieldRegistry,
} from "../types/index.js";

/** Options for registering or overriding a custom field type. */
export interface DefineFormFieldOptions {
  /** Default attrs applied to all descriptors of this `type`. */
  attrs?: Record<string, unknown>;
  /** Default get/set accessor for this `type`. */
  accessor?: FieldAccessor;
  /** Replaces an existing registration without warning. */
  override?: boolean;
}

/**
 * Typed API for registering a custom field component.
 * Must be called from a Nuxt plugin (the load order guarantees that `$mapoFormRegistry`
 * is already present — the `@mapomodule/form` plugin is loaded first).
 *
 * @example
 *   // app/plugins/my-fields.ts
 *   export default defineNuxtPlugin(() => {
 *     defineFormField('rich-text', () => import('~/components/RichText.vue'), {
 *       attrs: { rows: 6 },
 *     })
 *   })
 */
export function defineFormField(
  type: string,
  entry: FieldComponentEntry,
  opts: DefineFormFieldOptions = {},
): void {
  const nuxt = useNuxtApp() as unknown as { $mapoFormRegistry?: FieldRegistry };
  const registry = nuxt.$mapoFormRegistry;
  if (!registry) {
    if (import.meta.dev) {
      console.warn(
        `[Mapo] defineFormField('${type}') called before $mapoFormRegistry is available. ` +
          `Make sure the plugin is loaded after @mapomodule/form.`,
      );
    }
    return;
  }
  if (registry.mapping[type] && !opts.override) {
    if (import.meta.dev) {
      console.warn(
        `[Mapo] defineFormField: type "${type}" already registered. ` +
          `Pass { override: true } to replace it intentionally.`,
      );
    }
  }
  registry.mapping[type] = entry;
  if (opts.attrs) {
    registry.attrs[type] = { ...(registry.attrs[type] ?? {}), ...opts.attrs };
  }
  if (opts.accessor) {
    registry.accessor[type] = opts.accessor;
  }
}

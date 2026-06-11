import type { Component } from "vue";
import type { AnyFieldDescriptor, FieldAccessor } from "./descriptor.js";

/**
 * Accepted values for a registry entry:
 * - `string` — Nuxt UI component name, resolved at runtime via `resolveComponent()`
 * - `Component` — synchronous Vue component object
 * - `() => Promise<{ default: Component }>` — async lazy import
 */
export type FieldComponentEntry =
  | string
  | Component
  | (() => Promise<{ default: Component }>);

/** The global form field registry injected as `$mapoFormRegistry`. */
export interface FieldRegistry {
  /** Maps a field `type` string to its component entry. */
  mapping: Record<string, FieldComponentEntry>;
  /**
   * Default `attrs` merged into every field of the given type.
   * The special key `'All'` is applied to all field types.
   */
  attrs: Record<string, Record<string, unknown>>;
  /** Default `get`/`set` accessor applied per field type. */
  accessor: Record<string, FieldAccessor>;
}

/**
 * Partial version of {@link FieldRegistry} for consumer overrides
 * (e.g. `mapoForm.fields` in `nuxt.config`).
 */
export type PartialFieldRegistry = {
  mapping?: Partial<FieldRegistry["mapping"]>;
  attrs?: Partial<FieldRegistry["attrs"]>;
  accessor?: Partial<FieldRegistry["accessor"]>;
};

/**
 * Resolves the component entry for a given field descriptor.
 * Returns the `descriptor.is` override if set, otherwise looks up `registry.mapping`.
 */
// AnyFieldDescriptor<T> is contravariant in T through `validate: (ctx: { model: T })`.
// These functions only read `type`, `is`, `attrs`, and `accessor` — none depends on T —
// so `any` is the correct way to accept any AnyFieldDescriptor<T> without a type error.
export function resolveFieldComponent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: AnyFieldDescriptor<any>,
  registry: FieldRegistry,
): FieldComponentEntry | null {
  if (descriptor.is) return descriptor.is;
  return registry.mapping[descriptor.type] ?? null;
}

/**
 * Merges the registry-level default attrs for a field type with the descriptor's
 * own typed `attrs` and its open `passthrough` props.
 * Order: `registry.attrs['All']` → `registry.attrs[type]` → `descriptor.attrs`
 * → `descriptor.passthrough` (most specific wins).
 */
export function resolveFieldAttrs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: AnyFieldDescriptor<any>,
  registry: FieldRegistry,
): Record<string, unknown> {
  const allAttrs = registry.attrs["All"] ?? {};
  const typeAttrs = registry.attrs[descriptor.type] ?? {};
  // Not every descriptor in the union declares `attrs`; read it structurally.
  const ownAttrs =
    (descriptor as { attrs?: Record<string, unknown> }).attrs ?? {};
  return {
    ...allAttrs,
    ...typeAttrs,
    ...ownAttrs,
    ...(descriptor.passthrough ?? {}),
  };
}

/**
 * Merges the registry-level default accessor for a field type with the descriptor's own `accessor`.
 */
export function resolveFieldAccessor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: AnyFieldDescriptor<any>,
  registry: FieldRegistry,
): FieldAccessor {
  const typeAccessor = registry.accessor[descriptor.type] ?? {};
  return { ...typeAccessor, ...(descriptor.accessor ?? {}) };
}

/**
 * Shape of `runtimeConfig.public.mapoForm` as written by the module setup.
 * `groups` and `debounce` are guaranteed by the module `defaults`.
 */
export interface MapoFormRuntimeConfig {
  groups: { expanded: boolean };
  debounce: number;
  fields: { attrs: Record<string, Record<string, unknown>> };
}

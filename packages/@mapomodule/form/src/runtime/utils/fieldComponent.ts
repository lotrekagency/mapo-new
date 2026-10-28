import { defineAsyncComponent } from "vue";
import type { Component } from "vue";
import type { FieldComponentEntry } from "../types/index.js";

type FieldLoader = () => Promise<{ default: Component }>;

// `<component :is>` tells components apart by identity. An async wrapper created
// at every render would be a new component for every new descriptor object: Vue
// would unmount the field and mount another one, losing the focus and the
// field's state. One wrapper per loader, shared by every form, keeps the field
// mounted; it also keeps the loaded component, so later fields of that type
// render without waiting for the import. Weak keys let a loader created by a
// page be collected with it.
const asyncFields = new WeakMap<FieldLoader, Component>();

/**
 * Returns the component that `<component :is>` renders for a registry entry.
 * A lazy loader becomes an async component, created once per loader and reused;
 * a component name or a component is returned as it is.
 */
export function toFieldComponent(
  entry: FieldComponentEntry,
): string | Component {
  const isLoader = typeof entry === "function";
  if (!isLoader) return entry;

  const loader = entry as FieldLoader;
  const cached = asyncFields.get(loader);
  if (cached) return cached;

  const component = defineAsyncComponent(loader);
  asyncFields.set(loader, component);
  return component;
}

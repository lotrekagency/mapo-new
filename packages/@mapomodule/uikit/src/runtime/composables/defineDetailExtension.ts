import { defineAsyncComponent, shallowReactive } from "vue";
import type { Component } from "vue";
import { useNuxtApp } from "#app";
import type {
  DetailExtension,
  DetailExtensionLoader,
} from "../types/detail.js";

// One list per app instance: on the server, one per request.
const registries = new WeakMap<object, DetailExtension[]>();

/**
 * The extensions registered in the app, created on first use. `MapoDetail`
 * renders them through `MapoDetailExtensions`. @internal
 */
export function detailExtensions(
  nuxtApp: object = useNuxtApp(),
): DetailExtension[] {
  let list = registries.get(nuxtApp);
  if (!list) {
    list = shallowReactive<DetailExtension[]>([]);
    registries.set(nuxtApp, list);
  }
  return list;
}

/**
 * A loader becomes an async component once, when the extension is registered.
 * It takes the `default` export itself: Vue does so only for a real module.
 */
function toComponent(entry: Component | DetailExtensionLoader): Component {
  if (typeof entry !== "function") return entry;
  const load = entry as DetailExtensionLoader;
  return defineAsyncComponent(async () => {
    const loaded = await load();
    const isModule = typeof loaded === "object" && "default" in loaded;
    return isModule ? loaded.default : loaded;
  });
}

/**
 * Adds a component to every `MapoDetail` of the app: an action in the sidebar
 * card above Save (`placement: "actions"`), or content above the body form
 * (`"body-top"`). The component reads the detail with `useMapoDetail()`.
 *
 * Call it from a plugin, so it applies to every page. Registering a key again
 * replaces the extension; a page shows only some extensions, or none, with the
 * `extensions` prop of `MapoDetail`.
 *
 * @param extension Its key, placement, component and, optionally, `visible`
 * and `order`.
 * @returns A function that removes the extension.
 *
 * @example
 * // app/plugins/detail-actions.ts
 * export default defineNuxtPlugin(() => {
 *   defineDetailExtension({
 *     key: "duplicate",
 *     placement: "actions",
 *     component: () => import("~/components/DuplicateButton.vue"),
 *     visible: (detail) => !detail.isNew.value,
 *   });
 * });
 */
export function defineDetailExtension(extension: DetailExtension): () => void {
  const list = detailExtensions();
  const entry: DetailExtension = {
    ...extension,
    component: toComponent(extension.component),
  };
  const index = list.findIndex((item) => item.key === extension.key);
  if (index >= 0) list.splice(index, 1, entry);
  else list.push(entry);
  return () => {
    const at = list.indexOf(entry);
    if (at >= 0) list.splice(at, 1);
  };
}

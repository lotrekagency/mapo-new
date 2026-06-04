import type { Slots } from "vue";

/**
 * Creates a namespaced view of slots, including only those that start with the given prefix.
 *
 * Filtered slot names are normalized by removing the prefix from the slot key.
 *
 * @param slots Source Vue slots object.
 * @param prefix Prefix used to select which slots to include.
 * @returns A new `Slots` object containing only prefixed slots, renamed without the prefix.
 */
export function slotNamespace(slots: Slots, prefix: string): Slots {
  return Object.fromEntries(
    Object.entries(slots)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, fn]) => [name.slice(prefix.length), fn]),
  ) as Slots;
}

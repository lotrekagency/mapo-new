import type { AnyFieldDescriptor } from "../types/index.js";
import type { TabEntry } from "../types/layout.js";

/**
 * Whether a field shows for this model: neither its `visible` predicate, which
 * removes it, nor its `show` predicate, which hides it, keeps it out.
 */
export function isFieldShown(
  field: AnyFieldDescriptor,
  model: Record<string, unknown>,
): boolean {
  const removed = field.visible ? !field.visible({ model }) : false;
  const hidden = field.show ? !field.show({ model }) : false;
  return !removed && !hidden;
}

/**
 * Whether a tab has a field to show for this model, in one of its groups (sub-tabs
 * included) or in one of its child tabs.
 */
export function tabHasShownFields(
  tab: TabEntry,
  model: Record<string, unknown>,
): boolean {
  for (const group of tab.groups.values()) {
    const fields = [...group.fields, ...[...group.subtabs.values()].flat()];
    if (fields.some((field) => isFieldShown(field, model))) return true;
  }
  return [...tab.children.values()].some((child) =>
    tabHasShownFields(child, model),
  );
}

/**
 * The tab to open among the ones shown: the tab the user picked, while it is
 * shown; otherwise the first one. Empty when no tab is shown.
 */
export function pickActiveTab(
  shownTabs: TabEntry[],
  picked: string | null,
): string {
  const pickedTab = shownTabs.find((tab) => tab.name === picked);
  return (pickedTab ?? shownTabs[0])?.name ?? "";
}

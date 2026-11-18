import type { AnyFieldDescriptor } from "../types/index.js";
import type { TabEntry } from "../types/layout.js";

/**
 * Runs the field's `visible` or `show` predicate; a field without it passes.
 * A predicate that throws, say one reading `model.seo.enabled` while `seo` is
 * null, counts as `false`: it hides its own field, and the error does not take
 * the field's section, group card or tab down with it. Development builds warn.
 */
function passesPredicate(
  field: AnyFieldDescriptor,
  name: "visible" | "show",
  model: Record<string, unknown>,
): boolean {
  const predicate = field[name];
  if (!predicate) return true;
  try {
    return Boolean(predicate({ model }));
  } catch (error) {
    if (import.meta.dev) {
      console.warn(
        `[MapoForm] The \`${name}\` predicate of field "${String(field.key)}" threw, so the field is hidden.`,
        error,
      );
    }
    return false;
  }
}

/**
 * Whether the field's `visible` predicate removes it for this model. A removed
 * field is not rendered, and neither is its grid cell.
 */
export function isFieldRemoved(
  field: AnyFieldDescriptor,
  model: Record<string, unknown>,
): boolean {
  return !passesPredicate(field, "visible", model);
}

/**
 * Whether a field shows for this model: neither its `visible` predicate, which
 * removes it, nor its `show` predicate, which hides it, keeps it out.
 */
export function isFieldShown(
  field: AnyFieldDescriptor,
  model: Record<string, unknown>,
): boolean {
  const removed = isFieldRemoved(field, model);
  const hidden = !passesPredicate(field, "show", model);
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
 * shown; otherwise the first one. Empty when no tab is shown. A group's
 * sub-tabs are picked the same way.
 */
export function pickActiveTab(
  shownTabs: Pick<TabEntry, "name">[],
  picked: string | null,
): string {
  const pickedTab = shownTabs.find((tab) => tab.name === picked);
  return (pickedTab ?? shownTabs[0])?.name ?? "";
}

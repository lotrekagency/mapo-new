import type { FieldDescriptor } from "./index.js";

/**
 * A group of fields rendered inside a single group card.
 * `subtabs` holds fields assigned to a sub-tab bar within the group.
 *
 * Shared by `MapoForm` and `MapoFormTabs` so the grouped tree is a single
 * structural type (avoids "two unrelated types with the same name").
 */
export interface GroupEntry {
  label?: string;
  fields: FieldDescriptor[];
  subtabs: Map<string, FieldDescriptor[]>;
}

/** A tab panel; may nest further tabs through `children`. */
export interface TabEntry {
  name: string;
  label?: string;
  groups: Map<string, GroupEntry>;
  children: Map<string, TabEntry>;
}

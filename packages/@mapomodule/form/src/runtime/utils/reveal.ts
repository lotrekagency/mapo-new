import type { AnyFieldDescriptor } from "../types/index.js";
import type { TabEntry } from "../types/layout.js";
import { valuePath } from "./annotations.js";

/**
 * A request of `revealField()`, which the parts of a form act on: the tab,
 * the group and the repeater item that hold the field open, and the field
 * puts the focus on its control.
 */
export interface FieldRevealRequest {
  /** The path asked, in the form that holds the field: `title`, `translations.it.title`, `blocks.0.title`. */
  readonly path: string;
  /** The key of the form's field the path names, or holds a value of. */
  readonly key: string;
  /** The rest of the path inside that field's value: empty for the field itself, `0.title` in `blocks`. */
  readonly rest: string;
  /** Ends the request: `true` once the control has the focus. A second call does nothing. */
  readonly settle: (focused: boolean) => void;
}

/** The field a path names, and what of the path is inside its value. */
export interface FieldAtPath {
  field: AnyFieldDescriptor;
  /** Empty for the field itself; `2.author` for `blocks.2.author` in the field `blocks`. */
  rest: string;
}

/**
 * The field of `fields` whose value `path` is, or is inside: the longest key
 * that matches, so `seo.title` wins over `seo`. A translatable field answers
 * to the path of its value in `lang` and to its bare key, as its mark does.
 */
export function fieldAtPath(
  fields: readonly AnyFieldDescriptor[],
  path: string,
  lang: string,
): FieldAtPath | undefined {
  let found: FieldAtPath | undefined;
  let longest = -1;
  for (const field of fields) {
    const key = field.key as string;
    for (const candidate of new Set([valuePath(field, lang), key])) {
      const isField = path === candidate;
      const isInside = path.startsWith(`${candidate}.`);
      if (!isField && !isInside) continue;
      if (candidate.length <= longest) continue;
      longest = candidate.length;
      found = { field, rest: isField ? "" : path.slice(candidate.length + 1) };
    }
  }
  return found;
}

/** The fields of tabs: their groups, the groups' sub-tabs, and their child tabs. */
export function fieldsOfTabs(tabs: readonly TabEntry[]): AnyFieldDescriptor[] {
  return tabs.flatMap((tab) => [
    ...[...tab.groups.values()].flatMap((group) => [
      ...group.fields,
      ...[...group.subtabs.values()].flat(),
    ]),
    ...fieldsOfTabs([...tab.children.values()]),
  ]);
}

/** Whether a tab, or one of its child tabs, holds the field of `key`. */
export function tabHoldsField(tab: TabEntry, key: string): boolean {
  return fieldsOfTabs([tab]).some((field) => field.key === key);
}

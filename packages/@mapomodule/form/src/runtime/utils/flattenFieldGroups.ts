import type { AnyFieldDescriptor } from "../types/index.js";

/**
 * Hierarchical authoring structure. Lets you group field descriptors under a
 * named group without repeating `group` on every field.
 *
 * Pass an array of these to {@link flattenFieldGroups} to get the flat
 * `AnyFieldDescriptor<T>[]` expected by `<MapoForm>` / `<MapoDetail>`.
 */
export interface FieldGroupDescriptor<T = Record<string, unknown>> {
  /** Group name — propagated to every field in `fields`. */
  group: string;
  /** Optional tab — propagated to every field unless the field already has a `tab`. */
  tab?: string | string[];
  /** Fields belonging to this group. May contain nested `FieldGroupDescriptor` objects. */
  fields: Array<AnyFieldDescriptor<T> | FieldGroupDescriptor<T>>;
}

/** Type guard: distinguishes a `FieldGroupDescriptor` from a `AnyFieldDescriptor`. */
function isGroupDescriptor<T>(
  item: AnyFieldDescriptor<T> | FieldGroupDescriptor<T>,
): item is FieldGroupDescriptor<T> {
  return (
    "fields" in item && Array.isArray((item as FieldGroupDescriptor<T>).fields)
  );
}

/**
 * Flattens a mixed array of `AnyFieldDescriptor` and `FieldGroupDescriptor` objects
 * into a plain `AnyFieldDescriptor<T>[]` ready to be passed to `<MapoForm>` or `<MapoDetail>`.
 *
 * Each `FieldGroupDescriptor` propagates its `group` (and optionally `tab`) to
 * every leaf field it contains. Fields that already declare a `group` or `tab`
 * are left unchanged.
 *
 * Groups can be arbitrarily nested — the function recurses until every item is
 * a leaf `AnyFieldDescriptor`.
 *
 * @example
 * ```ts
 * const fields = flattenFieldGroups<Article>([
 *   { key: 'title', type: 'text', label: 'Title', tab: 'content' },
 *   {
 *     group: 'seo',
 *     tab: 'seo',
 *     fields: [
 *       { key: 'seo_title',       type: 'text',     label: 'SEO Title' },
 *       { key: 'seo_description', type: 'textarea', label: 'SEO Description' },
 *     ],
 *   },
 * ])
 * // Result:
 * // [
 * //   { key: 'title', type: 'text', label: 'Title', tab: 'content' },
 * //   { key: 'seo_title', type: 'text', label: 'SEO Title', group: 'seo', tab: 'seo' },
 * //   { key: 'seo_description', type: 'textarea', label: 'SEO Description', group: 'seo', tab: 'seo' },
 * // ]
 * ```
 */
export function flattenFieldGroups<T = Record<string, unknown>>(
  items: Array<AnyFieldDescriptor<T> | FieldGroupDescriptor<T>>,
  _inheritedGroup?: string,
  _inheritedTab?: string | string[],
): AnyFieldDescriptor<T>[] {
  const result: AnyFieldDescriptor<T>[] = [];

  for (const item of items) {
    if (isGroupDescriptor(item)) {
      const group = item.group ?? _inheritedGroup;
      const tab = item.tab ?? _inheritedTab;
      result.push(...flattenFieldGroups(item.fields, group, tab));
    } else {
      const field = item as AnyFieldDescriptor<T>;
      const merged: AnyFieldDescriptor<T> = { ...field };
      if (_inheritedGroup && !merged.group) {
        Object.assign(merged, { group: _inheritedGroup });
      }
      if (_inheritedTab && !merged.tab) {
        Object.assign(merged, { tab: _inheritedTab });
      }
      result.push(merged);
    }
  }

  return result;
}

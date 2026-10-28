/**
 * Keywords of Mapo's JSON Schema dialect, the one `useFormFromSchema()` reads
 * and `fieldsToJsonSchema()` writes.
 */

/**
 * Names the field type when the other keywords would map to another one, for
 * example `"switch"` on a boolean. Also how a normalizer marks a value it
 * cannot describe: a placeholder type such as `"field:author"`.
 */
export const FIELD_KEYWORD = "x-mapo-field";

/** Holds the field's `attrs` that no other keyword expresses. */
export const ATTRS_KEYWORD = "x-mapo-attrs";

/** The placeholder field type of a value a normalizer cannot describe. */
export function placeholderType(key: string): string {
  return `field:${key}`;
}

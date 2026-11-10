/** What a rich text editor writes into a field it leaves empty. */
const BLANK_MARKUP = /<\/?p>|<br\s*\/?>|&nbsp;/gi;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  const isLiteral = prototype === Object.prototype;
  const isBare = prototype === null;
  return isLiteral || isBare;
}

/**
 * Whether a form's value holds something: not `undefined` or `null`, not a
 * blank text (the empty paragraphs and line breaks of a rich text editor
 * included), not an empty list, not an object whose values all hold
 * nothing. `false`, `0` and any other object, such as a file, are values.
 */
export function holdsFormValue(value: unknown): boolean {
  if (value === undefined) return false;
  if (value === null) return false;
  if (typeof value === "string") {
    return value.replace(BLANK_MARKUP, " ").trim() !== "";
  }
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.values(value).some(holdsFormValue);
  return true;
}

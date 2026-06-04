/**
 * Returns true when `val` is a non-null plain object (excluding arrays).
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Deeply merges `override` into `base` and returns a new object.
 *
 * Nested plain objects are merged recursively, while other values replace
 * the corresponding base value when the override value is not `undefined`.
 *
 * @param base Base object.
 * @param override Partial object with values that should override `base`.
 * @returns A new object containing the merged result.
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>,
): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const baseVal = result[key];
    const overrideVal = override[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

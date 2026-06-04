/**
 * Reads a value from an object using a dot-notation path.
 *
 * @param obj Source object to traverse.
 * @param path Dot-notation path (for example, `"user.profile.name"`).
 * @returns The nested value, or `undefined` when the path cannot be fully resolved.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

/**
 * In-place version for Vue reactive proxies. Mutates obj directly so Vue's
 * reactivity system tracks the change. Creates missing intermediate objects.
 */
export function setNestedValueMutating(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] == null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Returns a new object with `value` assigned at the given dot-notation path.
 *
 * Existing nested objects along the path are shallow-cloned to preserve immutability.
 *
 * @param obj Source object.
 * @param path Dot-notation path where the value should be set.
 * @param value Value to assign at the target path.
 * @returns A new object with the updated nested value.
 */
export function setNestedValue<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split(".");
  const result = { ...obj } as Record<string, unknown>;
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...(current[key] as Record<string, unknown>) };
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result as T;
}

const VUE_RAW_FLAG = "__v_raw";

function unwrapVueRaw<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const maybeRaw = (value as Record<string, unknown>)[VUE_RAW_FLAG];
  if (maybeRaw && maybeRaw !== value) {
    return unwrapVueRaw(maybeRaw as T);
  }
  return value;
}

/**
 * Deep-clones a value and returns a detached copy.
 *
 * The function first unwraps Vue reactive proxies (when present), then:
 * - uses `structuredClone` when available
 * - falls back to recursive cloning for plain objects/arrays
 *
 * The recursive fallback does not support circular references.
 */
export function deepClone<T>(value: T): T {
  const raw = unwrapVueRaw(value);
  if (raw === null || typeof raw !== "object") return raw;

  if (typeof globalThis !== "undefined" && "structuredClone" in globalThis) {
    try {
      return structuredClone(raw);
    } catch {
      // Fall through to recursive clone.
    }
  }

  if (Array.isArray(raw)) return raw.map(deepClone) as unknown as T;
  const result = {} as Record<string, unknown>;
  for (const key of Object.keys(raw as object)) {
    result[key] = deepClone((raw as Record<string, unknown>)[key]);
  }
  return result as T;
}

/**
 * Type guard that returns true when `value` is a browser `File`.
 */
export function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

/**
 * Type guard that returns true when `value` is a browser `Blob`.
 */
export function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

/**
 * Type guard that returns true when `value` is either a `File` or a `Blob`.
 */
export function isFileOrBlob(value: unknown): value is File | Blob {
  return isFile(value) || isBlob(value);
}

/**
 * Return all dot-notation paths in `obj` where the predicate is truthy.
 */
export function findPropPaths(
  obj: unknown,
  predicate: (val: unknown) => boolean,
  _prefix = "",
): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const paths: string[] = [];
  for (const key of Object.keys(obj as object)) {
    const path = _prefix ? `${_prefix}.${key}` : key;
    const val = (obj as Record<string, unknown>)[key];
    if (predicate(val)) {
      paths.push(path);
    } else if (val !== null && typeof val === "object") {
      paths.push(...findPropPaths(val, predicate, path));
    }
  }
  return paths;
}

/** Return all paths in `obj` that hold a File or Blob. */
export function filesInObject(obj: unknown): string[] {
  return findPropPaths(obj, isFileOrBlob);
}

/**
 * Return a shallow copy of `obj` containing only the listed top-level keys.
 */
export function filterObj<T extends Record<string, unknown>>(
  obj: T,
  keys: (keyof T)[],
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

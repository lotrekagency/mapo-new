import type { MultipartPolicy } from "../types";
import { MultipartPolicyEnum } from "../types";

/**
 * Flattened file entry extracted from a nested payload.
 */
interface FileEntry {
  /** Dot-notation path where the file/blob was found in the original payload. */
  path: string;
  /** File-like value to append to FormData. */
  file: File | Blob;
}

/**
 * Recursively collects all `File`/`Blob` values from a nested payload.
 *
 * @param obj Value to inspect.
 * @param path Current dot-notation traversal path.
 * @returns A flat list of file entries with their original paths.
 */
function collectFiles(obj: unknown, path = ""): FileEntry[] {
  if (obj instanceof File || obj instanceof Blob) {
    return [{ path, file: obj }];
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((item, i) =>
      collectFiles(item, path ? `${path}.${i}` : String(i)),
    );
  }
  if (obj !== null && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(
      ([key, val]) => collectFiles(val, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/**
 * Converts a payload into multipart `FormData`.
 *
 * The full payload is serialized under the `data` field, while every extracted
 * `File`/`Blob` is appended as a dedicated FormData field at its dot-path key.
 *
 * @param obj Source payload object.
 * @returns Multipart form data representation of `obj`.
 */
function toFormData(obj: Record<string, unknown>): FormData {
  const files = collectFiles(obj);
  const fd = new FormData();
  // JSON.stringify naturally drops File/Blob — used as the plain-data field
  fd.append("data", JSON.stringify(obj));
  for (const { path, file } of files) {
    fd.append(path, file);
  }
  return fd;
}

/**
 * Applies the configured multipart policy to a request payload.
 *
 * Policy behavior:
 * - `Disable`: always return the original object payload.
 * - `Force`: always return a `FormData` payload.
 * - `Auto`: return `FormData` only when at least one `File`/`Blob` is present.
 *
 * @param payload Request payload object.
 * @param policy Multipart transformation policy.
 * @returns Either the original payload or a `FormData` instance.
 */
export function applyMultipartPolicy(
  payload: Record<string, unknown>,
  policy: MultipartPolicy,
): FormData | Record<string, unknown> {
  if (policy === MultipartPolicyEnum.Disable) return payload;
  if (policy === MultipartPolicyEnum.Force) return toFormData(payload);
  // auto: transform only if File/Blob are present
  return collectFiles(payload).length > 0 ? toFormData(payload) : payload;
}

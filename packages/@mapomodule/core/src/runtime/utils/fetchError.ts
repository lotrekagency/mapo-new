/**
 * Helpers to read the backend payload out of a failed `$mapoFetch` call.
 *
 * `ofetch` throws a `FetchError` that exposes the parsed response body as
 * `error.data` (and `error.response._data`) — NOT as `error.response.data`.
 * Reading the wrong path silently yields `undefined`, which turns every
 * backend validation message into a generic "something went wrong".
 * Use these helpers instead of destructuring the error by hand.
 */

/** Minimal structural view of an ofetch `FetchError`. */
interface FetchErrorLike {
  status?: number;
  statusCode?: number;
  data?: unknown;
  response?: { status?: number; _data?: unknown };
}

/**
 * Parsed response body of a failed request, or `undefined` when the request
 * failed before a response was received (network error, abort…).
 *
 * @example
 * try { await crud.create(model) }
 * catch (err) {
 *   const data = getErrorData<{ title?: string[] }>(err)
 *   errors.value = data ?? {}
 * }
 */
export function getErrorData<T = Record<string, unknown>>(
  error: unknown,
): T | undefined {
  const e = error as FetchErrorLike | null | undefined;
  return (e?.data ?? e?.response?._data) as T | undefined;
}

/** HTTP status of a failed request, or `0` when no response was received. */
export function getErrorStatus(error: unknown): number {
  const e = error as FetchErrorLike | null | undefined;
  return e?.status ?? e?.statusCode ?? e?.response?.status ?? 0;
}

/**
 * `detail` message returned by the backend (DRF convention), when present.
 * Falls back to `undefined` so callers can substitute a translated default.
 */
export function getErrorDetail(error: unknown): string | undefined {
  const data = getErrorData<{ detail?: unknown }>(error);
  return typeof data?.detail === "string" ? data.detail : undefined;
}

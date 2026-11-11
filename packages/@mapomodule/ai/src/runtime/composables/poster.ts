/**
 * How the composables call the gateway: `$mapoFetch` of `@mapomodule/core`,
 * so a session that ended leads to the login page as everywhere in Mapo;
 * `$fetch` without it.
 */

/** Posts a body to a path of the app's server, and resolves with the answer read as JSON. */
export type GatewayPoster = (
  path: string,
  body: unknown,
  options: { signal?: AbortSignal },
) => Promise<unknown>;

type Fetcher = (
  request: string,
  options: { method: "POST"; body: unknown; signal?: AbortSignal },
) => Promise<unknown>;

function isFetcher(value: unknown): value is Fetcher {
  return typeof value === "function";
}

/** The poster of the Nuxt app `app`: its `$mapoFetch`, else the global `$fetch`. */
export function gatewayPoster(app: object): GatewayPoster {
  const mapoFetch: unknown = Reflect.get(app, "$mapoFetch");
  const globalFetch: unknown = Reflect.get(globalThis, "$fetch");
  const fetcher = isFetcher(mapoFetch)
    ? mapoFetch
    : isFetcher(globalFetch)
      ? globalFetch
      : undefined;
  return (path, body, { signal }) =>
    fetcher
      ? fetcher(path, { method: "POST", body, signal })
      : Promise.reject(new Error("No $fetch to call the AI gateway with"));
}

/**
 * Gets a path of the app's server, and resolves with the answer read as
 * JSON. The signal closes the request.
 */
export type GatewayGetter = (
  path: string,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

type GetFetcher = (
  request: string,
  options: { method: "GET"; signal?: AbortSignal },
) => Promise<unknown>;

function isGetFetcher(value: unknown): value is GetFetcher {
  return typeof value === "function";
}

/** The getter of the Nuxt app `app`: its `$mapoFetch`, else the global `$fetch`. */
export function gatewayGetter(app: object): GatewayGetter {
  const mapoFetch: unknown = Reflect.get(app, "$mapoFetch");
  const globalFetch: unknown = Reflect.get(globalThis, "$fetch");
  const fetcher = isGetFetcher(mapoFetch)
    ? mapoFetch
    : isGetFetcher(globalFetch)
      ? globalFetch
      : undefined;
  return (path, options = {}) =>
    fetcher
      ? fetcher(path, {
          method: "GET",
          ...(options.signal ? { signal: options.signal } : {}),
        })
      : Promise.reject(new Error("No $fetch to call the AI gateway with"));
}

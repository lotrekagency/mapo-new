/**
 * How the AI settings page calls the gateway and the backend: `$mapoFetch`
 * of `@mapomodule/core`, so a session that ended leads to the login page
 * and a refusal shows Mapo's message, as everywhere in Mapo; the app's
 * translations, with the key itself when there is none. Not public: the
 * page's components share it.
 */

import { useNuxtApp, useRuntimeConfig } from "nuxt/app";
import { isRecord } from "../shared/guards";

/** A request to the app's server: a method, a body or a query. */
interface Request {
  method?: "GET" | "PUT" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string>;
}

type Fetcher = (path: string, options: Request) => Promise<unknown>;

/** Translates a key of the `mapo.*` messages with its named values. */
export type Translate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

/** What the settings page's components use. */
export interface SettingsClient {
  /** Calls a path of the app's server and resolves with its answer. */
  call<T>(path: string, request?: Request): Promise<T>;
  t: Translate;
  /** The backend's endpoints of users and groups, when the app sets them. */
  endpoints: { users?: string; groups?: string };
  /** A failed call, for people: the gateway's message, else its status. */
  failureOf(error: unknown): string;
}

/** The client of the settings page, in a component's setup. */
export function useSettingsClient(): SettingsClient {
  const app = useNuxtApp();
  const config = useRuntimeConfig();
  const mapoFetch: unknown = Reflect.get(app, "$mapoFetch");
  const globalFetch: unknown = Reflect.get(globalThis, "$fetch");
  const fetcher = [mapoFetch, globalFetch].find(
    (one): one is Fetcher => typeof one === "function",
  );
  const i18n: unknown = Reflect.get(app, "$i18n");
  const translate: unknown = isRecord(i18n) ? i18n.t : undefined;
  const t: Translate = (key, values = {}) => {
    if (typeof translate !== "function") return key;
    const text: unknown = Reflect.apply(translate, i18n, [key, values]);
    return typeof text === "string" ? text : key;
  };
  const publicAi: unknown = Reflect.get(config.public, "mapoAi");
  const settings = isRecord(publicAi) ? publicAi.settings : undefined;
  const endpointOf = (name: string): string | undefined => {
    const value = isRecord(settings) ? settings[name] : undefined;
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const users = endpointOf("usersApi");
  const groups = endpointOf("groupsApi");
  return {
    async call<T>(path: string, request: Request = {}): Promise<T> {
      if (!fetcher) throw new Error("No $fetch to call the server with");
      return (await fetcher(path, request)) as T;
    },
    t,
    endpoints: { ...(users ? { users } : {}), ...(groups ? { groups } : {}) },
    failureOf(error: unknown): string {
      const data = isRecord(error) ? error.data : undefined;
      const message = isRecord(data) ? data.statusMessage : undefined;
      const status = isRecord(error) ? error.statusCode : undefined;
      if (typeof message === "string" && message !== "") return message;
      return typeof status === "number"
        ? t("mapo.ai.settings.failedWith", { status })
        : t("mapo.ai.settings.failed");
    },
  };
}

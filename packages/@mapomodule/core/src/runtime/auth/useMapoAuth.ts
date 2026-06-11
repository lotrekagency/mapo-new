import { useNuxtApp, navigateTo, useCookie, useRuntimeConfig } from "nuxt/app";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
import { CoreCookieEnum } from "../types";
import type { Credentials, MapoCoreRuntimeConfig } from "../types";

/**
 * Optional endpoint overrides for auth operations.
 */
type AuthOverrides = {
  /** Login endpoint used to create the server session. */
  authLoginUrl?: string;
  /** Endpoint used to fetch the current authenticated user profile. */
  userInfoApi?: string;
  /** Logout endpoint used to invalidate the server session. */
  logoutUrl?: string;
};

/**
 * Provides authentication helpers built on top of the shared Mapo fetch client.
 *
 * Endpoints are resolved from runtime config and can be selectively overridden
 * through `options`.
 *
 * @param options Optional endpoint overrides for login, logout, and user fetch.
 * @returns Auth helpers: `login`, `logout`, and `fetchUser`.
 */
export function useMapoAuth(options?: AuthOverrides) {
  const rc = useRuntimeConfig().public.mapoCore as MapoCoreRuntimeConfig;
  const authLoginUrl = options?.authLoginUrl ?? rc.authLoginUrl;
  const userInfoApi = options?.userInfoApi ?? rc.userInfoApi;
  const logoutUrl = options?.logoutUrl ?? rc.logoutUrl;
  const loginUrl = rc.loginUrl;

  const { $mapoFetch } = useNuxtApp() as ReturnType<typeof useNuxtApp> & {
    $mapoFetch: typeof $fetch;
  };
  const authStore = useAuthStore();

  /**
   * Fetches the current user from `userInfoApi` and hydrates the auth store.
   */
  async function fetchUser(): Promise<void> {
    const user = await $mapoFetch<
      import("@mapomodule/store/runtime/types").MapoUser
    >(userInfoApi, { method: "GET" });
    authStore.setUser(user);
  }

  /**
   * Performs login and then confirms the session by fetching the current user.
   *
   * The backend is expected to set an HttpOnly session cookie on successful
   * login. `fetchUser` is used immediately after to hydrate store state.
   *
   * @param credentials User credentials payload for the login endpoint.
   */
  async function login(credentials: Credentials): Promise<void> {
    // The backend sets the session cookie (HttpOnly) on a successful login.
    // We confirm the session by fetching the user — if it succeeds, the
    // store is hydrated and isAuthenticated becomes true.
    await $mapoFetch(authLoginUrl, { method: "POST", body: credentials });
    await fetchUser();
  }

  /**
   * Logs out the current user and always performs local cleanup.
   *
   * Cleanup includes clearing the session cookie mirror, resetting auth store
   * state, removing persisted Mapo draft keys from localStorage, and navigating
   * to the configured login page.
   */
  async function logout(): Promise<void> {
    try {
      await $mapoFetch(logoutUrl, { method: "GET" });
    } finally {
      useCookie(CoreCookieEnum.Session).value = null;
      authStore.reset();
      if (typeof localStorage !== "undefined") {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith("mapo:draft:")) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
      }
      await navigateTo(loginUrl);
    }
  }

  return { login, logout, fetchUser };
}

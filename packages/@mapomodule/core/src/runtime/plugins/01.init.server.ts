import {
  defineNuxtPlugin,
  useRuntimeConfig,
  useCookie,
  useRequestHeaders,
} from "nuxt/app";
import { setActivePinia } from "pinia";
import type { Pinia } from "pinia";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
import { useSidebarStore } from "@mapomodule/store/runtime/stores/sidebar";
import type { MapoUser } from "@mapomodule/store/runtime/types";
import { CoreCookieEnum } from "../types";
import type { MapoCoreRuntimeConfig } from "../types";

/**
 * Performs server-side bootstrap of Mapo runtime stores.
 *
 * On each SSR request, this plugin:
 * - Activates the request Pinia instance and initializes auth/sidebar stores.
 * - Restores sidebar UI state from cookies.
 * - If the HttpOnly session cookie is present, calls the configured `userInfoApi`
 *   (forwarding request cookies) to restore the authenticated user in the auth store.
 *
 * On session restore failure it resets auth state, and clears the session cookie only
 * when the backend rejected the session (401/403) — never on a transport error.
 */
export default defineNuxtPlugin({
  name: "mapo-core:init",
  async setup(nuxtApp) {
    const runtimeConfig = useRuntimeConfig().public.mapoCore as
      | MapoCoreRuntimeConfig
      | undefined;
    const userInfoApi = runtimeConfig?.userInfoApi ?? "/api/profiles/me/";

    const pinia = nuxtApp.$pinia as Pinia;
    setActivePinia(pinia);
    const authStore = useAuthStore(pinia);
    const sidebarStore = useSidebarStore(pinia);

    sidebarStore.hydrateFromCookies();

    // The session cookie is HttpOnly — readable on SSR but not on the client.
    // If present, hydrate the auth store by fetching the user with the
    // incoming Cookie header forwarded to the proxy middleware.
    const sessionCookie = useCookie(CoreCookieEnum.Session);
    if (!sessionCookie.value) return;

    try {
      const headers = useRequestHeaders(["cookie"]);
      const user = await (
        nuxtApp.$mapoFetch as (url: string, opts: object) => Promise<unknown>
      )(userInfoApi, { method: "GET", headers });
      authStore.setUser(user as MapoUser);
    } catch (e) {
      console.error(`[mapo] Cannot restore session from cookie:\n${e}`);
      authStore.reset();
      // Only drop the cookie when the backend actually rejected the session.
      // A network blip or a 5xx must not log the user out: the cookie is HttpOnly,
      // so clearing it here is irreversible for the client.
      const status =
        (e as { status?: number; response?: { status?: number } })?.status ??
        (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) sessionCookie.value = null;
    }
  },
});

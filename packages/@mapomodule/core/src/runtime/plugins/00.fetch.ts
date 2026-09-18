import { ref, computed } from "vue";
import {
  defineNuxtPlugin,
  navigateTo,
  useRequestHeaders,
  useRoute,
  useRuntimeConfig,
} from "nuxt/app";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import type { MapoCoreRuntimeConfig } from "../types";

/**
 * Registers the global Mapo fetch client and loading state.
 *
 * The plugin provides:
 * - `$mapoFetch`: a shared `$fetch` instance with centralized request/response hooks.
 * - `$mapoFetchLoading`: a computed boolean based on a global pending-request counter.
 *
 * Error handling behavior:
 * - `401` (except logout calls): reset auth state and, on client, redirect to login
 *   with the current route encoded in a `redirect` query parameter.
 * - `403`: show a global "Permission denied" error snackbar.
 */
export default defineNuxtPlugin({
  name: "mapo-core:fetch",
  enforce: "pre",
  setup() {
    const rc = useRuntimeConfig().public.mapoCore as MapoCoreRuntimeConfig;
    const logoutUrl = rc.logoutUrl;
    const loginUrl = rc.loginUrl;

    // Track whether a 401 redirect is already in flight to prevent duplicate redirects.
    let redirectInFlight = false;

    const handle = (status: number, requestUrl: string) => {
      if (
        status === 401 &&
        !requestUrl.includes(logoutUrl) &&
        !redirectInFlight
      ) {
        redirectInFlight = true;
        const auth = useAuthStore();
        auth.reset();
        if (import.meta.client) {
          const route = useRoute();
          navigateTo(
            `${loginUrl}?redirect=${encodeURIComponent(route.fullPath)}`,
          );
        }
      }
      if (status === 403) {
        useSnackStore().show("Permission denied", "error");
      }
    };

    // Global loading counter — incremented on every request, decremented once on every
    // response (success or error) or request error. Exposed as $mapoFetchLoading so any
    // component can show a spinner without wrapping every fetch call manually.
    const pending = ref(0);
    const mapoFetchLoading = computed(() => pending.value > 0);

    const forwardedCookie = import.meta.server
      ? useRequestHeaders(["cookie"]).cookie
      : undefined;

    const mapoFetch = $fetch.create({
      onRequest({ options }) {
        pending.value++;
        if (forwardedCookie) {
          const headers = new Headers(
            options.headers as HeadersInit | undefined,
          );
          if (!headers.has("cookie")) headers.set("cookie", forwardedCookie);
          options.headers = headers;
        }
      },
      onResponse({ response, request }) {
        pending.value--;
        handle(response.status, String(request));
      },
      onRequestError() {
        // Decrement counter on network errors (no response received).
        pending.value--;
      },
    });

    return {
      provide: { mapoFetch, mapoFetchLoading },
    };
  },
});

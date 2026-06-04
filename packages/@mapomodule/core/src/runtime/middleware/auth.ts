import {
  defineNuxtRouteMiddleware,
  navigateTo,
  useRuntimeConfig,
} from "nuxt/app";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";

/**
 * Route middleware that protects authenticated pages.
 *
 * If the user is not authenticated, it redirects to the configured login page
 * and appends the current route (`to.fullPath`) as a `redirect` query param,
 * so the app can return the user to the original destination after login.
 */
export default defineNuxtRouteMiddleware((to) => {
  const loginUrl = (useRuntimeConfig().public.mapoCore as { loginUrl: string })
    .loginUrl;
  const auth = useAuthStore();
  if (!auth.isAuthenticated) {
    return navigateTo(
      `${loginUrl}?redirect=${encodeURIComponent(to.fullPath)}`,
    );
  }
});

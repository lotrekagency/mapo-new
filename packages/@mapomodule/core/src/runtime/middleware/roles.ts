import { defineNuxtRouteMiddleware, createError } from "nuxt/app";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";

/**
 * Route middleware that enforces role-based access from `to.meta.roles`.
 *
 * Access rules:
 * - If no roles are configured on the route, access is allowed.
 * - Superusers always bypass role checks.
 * - For other users, at least one required role must match a user group.
 * - If no match is found, navigation is blocked with HTTP 403.
 */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();
  const required = to.meta.roles as string[] | undefined;
  if (!required?.length) return;
  if (auth.info?.is_superuser) return;
  const userGroups = auth.info?.groups ?? [];
  const hasRole = required.some((r) => userGroups.includes(r));
  if (!hasRole) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }
});

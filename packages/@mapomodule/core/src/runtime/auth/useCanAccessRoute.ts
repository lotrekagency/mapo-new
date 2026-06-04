import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
import type { RouteMeta } from "vue-router";

/** Two-format permission spec: Django model shorthand or explicit codename list. */
export type RoutePermissions = { model: string } | string[];

/**
 * Returns whether the current user can access a route based on its meta.
 * Mirrors the logic of the `auth`, `permissions`, and `roles` middlewares
 * so the sidebar and any UI that gates visibility stays in sync with navigation guards.
 */
export function useCanAccessRoute(meta: RouteMeta): boolean {
  const auth = useAuthStore();

  const raw = meta.middleware;
  const middleware = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // auth middleware: must be logged in
  if (middleware.includes("auth") && !auth.isAuthenticated) return false;

  // roles middleware
  if (middleware.includes("roles")) {
    const required = meta.roles as string[] | undefined;
    if (required?.length && !auth.info?.is_superuser) {
      const userGroups = auth.info?.groups ?? [];
      if (!required.some((r: string) => userGroups.includes(r))) return false;
    }
  }

  // permissions middleware
  if (middleware.includes("permissions")) {
    const perms = meta.permissions as RoutePermissions | undefined;
    if (perms && !auth.info?.is_superuser) {
      if (Array.isArray(perms)) {
        if (!perms.every((p) => auth.rawPermissions.includes(p))) return false;
      } else {
        const hasView = auth.rawPermissions.some(
          (p) =>
            p === `view_${perms.model}` ||
            (p.endsWith(`_${perms.model}`) && p.startsWith("view")),
        );
        if (!hasView) return false;
      }
    }
  }

  return true;
}

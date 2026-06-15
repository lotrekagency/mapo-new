import { defineNuxtRouteMiddleware, createError } from "nuxt/app";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";

type RoutePermissions = { model: string } | string[];

/**
 * Route middleware that enforces page-level permissions from `to.meta.permissions`.
 *
 * Supported formats:
 * - `string[]`: all listed raw permission codenames are required.
 * - `{ model: string }`: permissions are derived from codenames ending with
 *   `_<model>` (for example, `view_article`, `change_article`).
 *
 * Behavior:
 * - If no permissions are declared, access is allowed.
 * - Superusers always pass; for model-based permissions, full CRUD actions are
 *   exposed in `auth.pagePermissions[routeName]`.
 * - For regular users, access is denied with HTTP 403 when required permissions
 *   are missing (or `view` is missing for model-based permissions).
 * - For allowed model-based routes, resolved actions are stored in
 *   `auth.pagePermissions[routeName]`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();
  const perms = to.meta.permissions as RoutePermissions | undefined;
  if (!perms) return;
  if (auth.info?.is_superuser) {
    if (!Array.isArray(perms)) {
      auth.pagePermissions[String(to.name)] = [
        "view",
        "add",
        "change",
        "delete",
      ];
    }
    return;
  }

  if (Array.isArray(perms)) {
    if (!perms.every((p) => auth.rawPermissions.includes(p)))
      throw createError({ statusCode: 403, message: "Forbidden" });
  } else {
    const actions = auth.rawPermissions
      .filter((p) => p.endsWith(`_${perms.model}`))
      .map((p) => p.replace(`_${perms.model}`, ""));

    if (!actions.includes("view"))
      throw createError({ statusCode: 403, message: "Forbidden" });

    auth.pagePermissions[String(to.name)] = actions;
  }
});

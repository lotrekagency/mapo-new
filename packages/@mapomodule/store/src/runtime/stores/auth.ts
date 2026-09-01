import { defineStore } from "pinia";
import type { MapoPermission, MapoUser, ModelPermissions } from "../types";

/**
 * Builds model-level permission flags from raw codename permissions.
 *
 * Expected codename format: `<action>_<model>`, where action is one of
 * `view`, `add`, `change`, or `delete`.
 *
 * @param raw Raw permission codenames.
 * @returns Model-keyed permission map with CRUD booleans.
 */
/**
 * Codenames, out of whatever shape the backend sent.
 *
 * A pk is dropped rather than stringified: nothing on the client can resolve one
 * to a codename, and keeping it would put a key in `rawPermissions` that no
 * check ever matches — an access denial dressed up as a granted permission.
 */
function toCodenames(raw: MapoPermission[]): string[] {
  const names = raw.flatMap((perm) => {
    if (typeof perm === "string") return [perm];
    const codename = (perm as { codename?: unknown })?.codename;
    return typeof codename === "string" ? [codename] : [];
  });
  // Losing every permission silently locks the user out of every gated panel
  // with nothing in the console to explain it.
  if (raw.length && !names.length)
    console.warn(
      "[mapo] User payload carried permissions with no codename in them, so every model permission is off. Serialize them as codenames, or as objects with a `codename`.",
    );
  return names;
}

function buildModelPermissions(
  raw: string[],
): Record<string, ModelPermissions> {
  const map: Record<string, ModelPermissions> = {};
  for (const codename of raw) {
    const match = codename.match(/^(view|add|change|delete)_(.+)$/);
    if (!match) continue;
    const [, action, model] = match as [string, string, string];
    if (!map[model])
      map[model] = { view: false, add: false, change: false, delete: false };
    map[model]![action as keyof ModelPermissions] = true;
  }
  return map;
}

// The session credential is an HttpOnly cookie managed by the backend/proxy
// and is intentionally not stored in the client state. Authentication is
// derived from the presence of a loaded user info object.
/**
 * Authentication store for user identity and permission state.
 *
 * It keeps normalized permission representations used by guards and middleware:
 * - `rawPermissions`: backend codenames (for example, `view_article`).
 * - `modelPermissions`: CRUD flags grouped per model.
 * - `pagePermissions`: route-scoped action lists resolved at runtime.
 */
export const useAuthStore = defineStore("mapo-auth", {
  state: () => ({
    info: null as MapoUser | null,
    rawPermissions: [] as string[],
    modelPermissions: {} as Record<string, ModelPermissions>,
    pagePermissions: {} as Record<string, string[]>,
  }),

  getters: {
    isAuthenticated: (state) => !!state.info,
    isLoggedIn: (state) => !!state.info,
    role: (state) => state.info?.groups?.[0] ?? null,
    username: (state) => state.info?.username ?? null,
    permissions: (state) => state.rawPermissions,
  },

  actions: {
    /**
     * Hydrates auth state from a resolved user profile.
     *
     * @param user Authenticated user payload.
     */
    setUser(user: MapoUser) {
      this.info = user;
      const perms = toCodenames(
        user.all_permissions ?? user.user_permissions ?? [],
      );
      this.rawPermissions = perms;
      this.modelPermissions = buildModelPermissions(perms);
    },

    /**
     * Clears all auth and permission state.
     */
    reset() {
      this.info = null;
      this.rawPermissions = [];
      this.modelPermissions = {};
      this.pagePermissions = {};
    },
  },
});

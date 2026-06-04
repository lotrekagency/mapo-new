import { defineStore } from "pinia";
import type { MapoUser, ModelPermissions } from "../types";

/**
 * Builds model-level permission flags from raw codename permissions.
 *
 * Expected codename format: `<action>_<model>`, where action is one of
 * `view`, `add`, `change`, or `delete`.
 *
 * @param raw Raw permission codenames.
 * @returns Model-keyed permission map with CRUD booleans.
 */
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
      const perms = user.all_permissions ?? user.user_permissions ?? [];
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

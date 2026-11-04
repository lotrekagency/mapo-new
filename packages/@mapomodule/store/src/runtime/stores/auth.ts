import { defineStore } from "pinia";
import { userPermissions } from "@mapomodule/utils";
import type { MapoUser, ModelPermissions } from "../types";

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
      // The shared reading of a user payload: server code that reads the
      // same user with it gets the same permissions.
      const { codenames, models, unreadable } = userPermissions(user);
      // Losing every permission silently locks the user out of every gated
      // panel with nothing in the console to explain it.
      if (unreadable)
        console.warn(
          "[mapo] User payload carried permissions with no codename in them, so every model permission is off. Serialize them as codenames, or as objects with a `codename`.",
        );
      this.rawPermissions = codenames;
      this.modelPermissions = models;
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

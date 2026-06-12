import { defineStore } from "pinia";
import { useCookie } from "nuxt/app";
import { SidebarCookieEnum } from "../types";

/**
 * Sidebar UI state store (drawer, mini) with cookie persistence.
 */
export const useSidebarStore = defineStore("mapo-sidebar", {
  state: () => ({
    drawer: true,
    mini: false,
  }),

  actions: {
    // Called from the server-only init plugin (plugins/01.init.server.ts in mapomodule)
    /**
     * Hydrates sidebar state from persisted cookies.
     */
    hydrateFromCookies() {
      const drawer = useCookie(SidebarCookieEnum.Drawer);
      const mini = useCookie(SidebarCookieEnum.Mini);
      if (drawer.value != null) this.drawer = drawer.value !== "0";
      if (mini.value != null) this.mini = mini.value === "1";
    },

    /** Toggles drawer visibility and persists the new value in cookies. */
    toggleDrawer() {
      this.drawer = !this.drawer;
      useCookie(SidebarCookieEnum.Drawer).value = this.drawer ? "1" : "0";
    },

    /** Toggles compact sidebar mode and persists the new value in cookies. */
    toggleMini() {
      this.mini = !this.mini;
      useCookie(SidebarCookieEnum.Mini).value = this.mini ? "1" : "0";
    },
  },
});

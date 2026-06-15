import vuetify, { transformAssetUrls } from "vite-plugin-vuetify";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  // Headless test bench: Mapo core + form only, no UIKit, no Nuxt UI.
  // Backend is a local Nitro mock under server/api/ — no external service.
  modules: [
    "@mapomodule/core",
    "@mapomodule/form",
    (_options, nuxt) => {
      nuxt.hooks.hook("vite:extendConfig", (config) => {
        config.plugins = config.plugins || [];
        config.plugins.push(vuetify({ autoImport: true }));
      });
    },
  ],

  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
  },

  css: ["vuetify/styles", "@mdi/font/css/materialdesignicons.css"],

  vue: { template: { transformAssetUrls } },

  build: {
    transpile: ["vuetify"],
  },
});

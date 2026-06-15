export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  modules: [
    "@nuxt/ui",
    "mapomodule",
    "@mapomodule/form",
    "mapo-integrations-camomilla",
  ],

  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",

    // Route CSS through the uikit module so Tailwind v4 + @nuxt/ui
    // process it in the same pipeline as example-theme — this is what
    // makes icons and design tokens load correctly.
    uikit: {
      css: "~/assets/css/main.css",
    },
  },

  camomilla: {
    server: "http://localhost:8000",
    syncCamomillaSession: false,
  },
});

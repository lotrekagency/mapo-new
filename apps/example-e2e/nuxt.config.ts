// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  modules: ["@nuxt/ui", "mapomodule"],
  devtools: { enabled: true },

  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",

    i18n: {
      defaultLocale: "en",
      // `file` points at i18n/locales/<file>: those messages are deep-merged on
      // top of Mapo's own catalogs, which is how the /i18n page overrides
      // `mapo.listTable.noItems` without touching anything else.
      locales: [
        { code: "en", language: "en-US", name: "English", file: "en.json" },
        { code: "it", language: "it-IT", name: "Italiano", file: "it.json" },
      ],
    },
  },
});

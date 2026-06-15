export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  // @nuxt/ui MUST come before mapomodule to avoid SSR Icon loop
  modules: ["@nuxt/ui", "mapomodule", "@mapomodule/form"],

  mapo: {
    // Fake endpoints — this app doesn't connect to a real backend
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",

    uikit: {
      // ① CSS token override — loaded after base uikit CSS, always wins
      css: "~/assets/css/theme.css",

      // ② Nuxt UI component defaults — deep-merged into nuxt.options.ui
      // These apply globally: every UButton, UCard, UInput etc. in the app
      ui: {
        button: {
          defaultVariants: {
            color: "primary",
            variant: "solid",
          },
        },
        card: {
          slots: {
            root: "rounded-xl shadow-md",
          },
        },
        input: {
          defaultVariants: {
            variant: "outline",
          },
        },
      },
    },
  },
});

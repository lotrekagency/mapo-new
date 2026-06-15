import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    ssr: true,
    icons: { defaultSet: "mdi", aliases, sets: { mdi } },
    theme: {
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            primary: "#1f6feb",
            secondary: "#6c757d",
          },
        },
      },
    },
  });
  nuxtApp.vueApp.use(vuetify);
});

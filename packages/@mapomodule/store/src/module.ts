import {
  defineNuxtModule,
  addImports,
  hasNuxtModule,
  installModule,
  createResolver,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";

export { SnackTypeEnum, SidebarCookieEnum } from "./runtime/types";
export type {
  MapoUser,
  ModelPermissions,
  SnackType,
  SnackMessage,
  ConfirmOptions,
} from "./runtime/types";

export { useAuthStore } from "./runtime/stores/auth";
export { useSnackStore } from "./runtime/stores/snack";
export { useConfirmStore } from "./runtime/stores/confirm";
export { usePermissions } from "./runtime/composables/usePermissions";

export default defineNuxtModule({
  meta: {
    name: "@mapomodule/store",
    configKey: "mapoStore",
  },

  async setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url);

    if (!hasNuxtModule("@pinia/nuxt")) {
      await installModule(await resolver.resolvePath("@pinia/nuxt"));
    }

    addImports([
      { name: "useAuthStore", from: resolver.resolve("./runtime/stores/auth") },
      {
        name: "useSnackStore",
        from: resolver.resolve("./runtime/stores/snack"),
      },
      {
        name: "useConfirmStore",
        from: resolver.resolve("./runtime/stores/confirm"),
      },
      {
        name: "useSidebarStore",
        from: resolver.resolve("./runtime/stores/sidebar"),
      },
      {
        name: "usePermissions",
        from: resolver.resolve("./runtime/composables/usePermissions"),
      },
    ]);
  },
}) satisfies NuxtModule;

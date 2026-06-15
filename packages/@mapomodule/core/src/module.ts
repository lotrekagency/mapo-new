import { readFileSync } from "node:fs";
import {
  defineNuxtModule,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addTypeTemplate,
  hasNuxtModule,
  installModule,
  createResolver,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import { MAPO_DEFAULTS } from "./types";
import type { MapoOptions } from "./types";

export type { MapoOptions } from "./types";
export type {
  ListParams,
  PaginatedResponse,
  ApiResponse,
  CrudConfig,
  CrudOptions,
  CrudRepository,
  MultipartPolicy,
  Credentials,
  AuthToken,
} from "./runtime/types";
export { MultipartPolicyEnum, CoreCookieEnum } from "./runtime/types";
export type { MapoFacade, MapoApiLayer } from "./runtime/composables/useMapo";
export type { RoutePermissions } from "./runtime/auth/useCanAccessRoute";

export default defineNuxtModule<MapoOptions>({
  meta: {
    name: "@mapomodule/core",
    configKey: "mapoCore",
  },

  defaults: MAPO_DEFAULTS,

  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    addTypeTemplate({
      filename: "types/mapo-core-page-meta.d.ts",
      getContents: () =>
        readFileSync(
          resolver.resolve("./runtime/page-meta.nuxt.d.ts"),
          "utf-8",
        ),
    });

    if (!hasNuxtModule("@mapomodule/store")) {
      await installModule("@mapomodule/store");
    }

    // `defaults` guarantees these are set at runtime, but MapoOptions keeps
    // them optional — spread the defaults so the assignment is fully defined.
    nuxt.options.runtimeConfig.public.mapoCore = {
      ...MAPO_DEFAULTS,
      ...options,
    };

    addPlugin({ src: resolver.resolve("./runtime/plugins/00.fetch") });
    addPlugin({
      src: resolver.resolve("./runtime/plugins/01.init.server"),
      mode: "server",
    });

    addImports([
      { name: "useCrud", from: resolver.resolve("./runtime/api/crud") },
      {
        name: "useMapoAuth",
        from: resolver.resolve("./runtime/auth/useMapoAuth"),
      },
      {
        name: "useMapo",
        from: resolver.resolve("./runtime/composables/useMapo"),
      },
      {
        name: "useCanAccessRoute",
        from: resolver.resolve("./runtime/auth/useCanAccessRoute"),
      },
      {
        name: "useMapoFetch",
        from: resolver.resolve("./runtime/utils/useMapoFetch"),
      },
    ]);

    addRouteMiddleware({
      name: "auth",
      path: resolver.resolve("./runtime/middleware/auth"),
    });
    addRouteMiddleware({
      name: "permissions",
      path: resolver.resolve("./runtime/middleware/permissions"),
    });
    addRouteMiddleware({
      name: "roles",
      path: resolver.resolve("./runtime/middleware/roles"),
    });
  },
}) satisfies NuxtModule<MapoOptions>;

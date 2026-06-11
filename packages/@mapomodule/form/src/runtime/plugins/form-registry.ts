import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { defaultRegistry } from "../registry/defaults.js";
import type { FieldRegistry, MapoFormRuntimeConfig } from "../types/index.js";

declare module "#app" {
  interface NuxtApp {
    $mapoFormRegistry: FieldRegistry;
  }
}

declare module "vue" {
  interface ComponentCustomProperties {
    $mapoFormRegistry: FieldRegistry;
  }
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const mapoForm = config.public.mapoForm as MapoFormRuntimeConfig | undefined;
  const userAttrs = mapoForm?.fields?.attrs ?? {};

  // Merge user attrs onto defaults: user takes priority per-type, including 'All'
  const mergedAttrs = { ...defaultRegistry.attrs };
  for (const [type, overrides] of Object.entries(userAttrs)) {
    mergedAttrs[type] = { ...(mergedAttrs[type] ?? {}), ...overrides };
  }

  // mapping and accessor contain functions — not serialisable via runtimeConfig.
  // To extend them, create a Nuxt plugin in the consumer app (ordered after this plugin):
  //   export default defineNuxtPlugin(({ $mapoFormRegistry }) => {
  //     $mapoFormRegistry.mapping['my-type'] = () => import('~/components/MyField.vue')
  //     $mapoFormRegistry.accessor['my-type'] = { get: ..., set: ... }
  //   })
  const registry: FieldRegistry = {
    mapping: { ...defaultRegistry.mapping },
    attrs: mergedAttrs,
    accessor: { ...defaultRegistry.accessor },
  };

  return {
    provide: { mapoFormRegistry: registry },
  };
});

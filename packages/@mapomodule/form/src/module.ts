import {
  defineNuxtModule,
  addComponent,
  addPlugin,
  addTypeTemplate,
  createResolver,
  addImports,
  extendPages,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import type { PartialFieldRegistry } from "./runtime/types/index.js";

export interface MapoFormOptions {
  fields?: PartialFieldRegistry;
  groups?: { expanded?: boolean };
  debounce?: number;
}

export default defineNuxtModule<MapoFormOptions>({
  meta: {
    name: "@mapomodule/form",
    configKey: "mapoForm",
  },

  defaults: {
    debounce: 300,
    groups: { expanded: true },
  },

  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Only serializable values can go into runtimeConfig.public.
    // `mapping` and `accessor` contain functions → not SSR-serializable.
    // To extend mapping/accessor, use an app plugin that accesses $mapoFormRegistry:
    //   export default defineNuxtPlugin(({ $mapoFormRegistry }) => {
    //     $mapoFormRegistry.mapping['my-type'] = () => import('~/components/MyField.vue')
    //   })
    // `defaults` guarantees groups/debounce at runtime; fall back explicitly
    // so the assignment type is fully defined.
    nuxt.options.runtimeConfig.public.mapoForm = {
      groups: { expanded: options.groups?.expanded ?? true },
      debounce: options.debounce ?? 300,
      // attrs is JSON-serialisable (plain objects) — merged in the plugin
      fields: { attrs: options.fields?.attrs ?? {} },
    };

    // Plugin: create and inject the global field registry
    addPlugin(resolver.resolve("./runtime/plugins/form-registry"));

    // Augment NuxtApp with $mapoFormRegistry so consumers get type-safe access.
    // nuxt-module-builder leaves runtime/*.d.ts empty, so InjectionType cannot
    // infer the plugin's provide shape — we inject the declaration explicitly.
    addTypeTemplate({
      filename: "types/mapo-form-registry.d.ts",
      getContents: () => `
import type { FieldRegistry } from '@mapomodule/form/types';
declare module '#app' {
  interface NuxtApp {
    $mapoFormRegistry: FieldRegistry;
  }
}
declare module 'vue' {
  interface ComponentCustomProperties {
    $mapoFormRegistry: FieldRegistry;
  }
}
export {};
`,
    });

    // Devtools tab + route (development only)
    if (nuxt.options.dev) {
      // The route is registered inside the consumer app so the page can call useNuxtApp() normally.
      extendPages((pages) => {
        pages.push({
          name: "mapo-devtools-forms",
          path: "/_mapo/devtools/forms",
          file: resolver.resolve("./runtime/devtools/DevtoolsFormsPage.vue"),
        });
      });

      // Registra il tab via hook nativo di Nuxt DevTools (no dipendenza @nuxt/devtools-kit)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (nuxt as any).hook(
        "devtools:customTabs",
        (tabs: Array<Record<string, unknown>>) => {
          tabs.push({
            name: "mapo-forms",
            title: "Mapo Forms",
            icon: "i-lucide-layout-list",
            view: { type: "iframe", src: "/_mapo/devtools/forms" },
          });
        },
      );
    }

    // Form shell components
    const shellComponents = [
      "MapoForm",
      "MapoFormField",
      "MapoFormGroup",
      "MapoFormTabs",
      "MapoUnknownField",
      "MapoFocusPortal",
    ];
    for (const name of shellComponents) {
      addComponent({
        name,
        filePath: resolver.resolve(`./runtime/components/${name}.vue`),
      });
    }

    // Public auto-imported composables
    addImports([
      {
        name: "useMapoForm",
        from: resolver.resolve("./runtime/composables/useMapoForm"),
      },
      {
        name: "useCurrentLang",
        from: resolver.resolve("./runtime/composables/useCurrentLang"),
      },
      {
        name: "provideCurrentLang",
        from: resolver.resolve("./runtime/composables/useCurrentLang"),
      },
      {
        name: "useFormFromSchema",
        from: resolver.resolve("./runtime/composables/useFormFromSchema"),
      },
      {
        name: "useFormDraft",
        from: resolver.resolve("./runtime/composables/useFormDraft"),
      },
      {
        name: "useFocusMode",
        from: resolver.resolve("./runtime/composables/useFocusMode"),
      },
      {
        name: "defineFormField",
        from: resolver.resolve("./runtime/composables/defineFormField"),
      },
      // Progressive disclosure DSL
      {
        name: "when",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "whenAny",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "whenNot",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "matchesField",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "isOneOf",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "isNoneOf",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "isNotEmpty",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "isEmpty",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "greaterThan",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "lessThan",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
      {
        name: "matches",
        from: resolver.resolve(
          "./runtime/composables/useProgressiveDisclosure",
        ),
      },
    ]);
  },
}) satisfies NuxtModule<MapoFormOptions>;

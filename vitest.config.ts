import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";

// Tests that mount a `.vue` component need it compiled for the client, so they
// run in a project of their own (see vitest.client-environment.ts).
const componentTests = "**/*.component.test.ts";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Nuxt virtual module — not available outside the Nuxt runtime.
      "#imports": fileURLToPath(
        new URL(
          "packages/@mapomodule/form/src/__tests__/__mocks__/nuxt-imports.ts",
          import.meta.url,
        ),
      ),
    },
  },
  // `import.meta.server` is a Nuxt build-time flag; unit tests exercise the server
  // branch (it is read in exactly one place, plugins/00.fetch.ts). `import.meta.client`
  // and `import.meta.dev` are deliberately left undefined so their guards stay falsy.
  define: {
    "import.meta.server": "true",
  },

  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          exclude: [...configDefaults.exclude, componentTests],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            // The client transform resolves every import up front; the SSR one
            // leaves `#app` to `vi.mock`.
            "#app": fileURLToPath(
              new URL(
                "packages/@mapomodule/uikit/src/__tests__/__mocks__/nuxt-app.ts",
                import.meta.url,
              ),
            ),
          },
        },
        test: {
          name: "component",
          include: [componentTests],
          environment: "./vitest.client-environment.ts",
        },
      },
    ],
  },
});

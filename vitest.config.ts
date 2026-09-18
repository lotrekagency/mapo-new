import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";

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
  },
});

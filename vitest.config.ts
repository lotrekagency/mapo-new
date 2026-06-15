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
  test: {
    environment: "node",
  },
});

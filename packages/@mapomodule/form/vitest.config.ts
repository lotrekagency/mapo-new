import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Local Vitest config for the `@mapomodule/form` package tests. */
export default defineConfig({
  resolve: {
    alias: {
      // Nuxt virtual module — not available outside the Nuxt runtime.
      "#imports": fileURLToPath(
        new URL("src/__tests__/__mocks__/nuxt-imports.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
  },
});

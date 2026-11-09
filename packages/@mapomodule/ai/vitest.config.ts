import { configDefaults, defineConfig } from "vitest/config";

/** Local Vitest config for the `@mapomodule/ai` package tests. */
export default defineConfig({
  test: {
    environment: "node",
    // Component tests mount `.vue` files compiled for the client: they run from
    // the root config, which has the Vue plugin and that environment.
    exclude: [...configDefaults.exclude, "**/*.component.test.ts"],
  },
});

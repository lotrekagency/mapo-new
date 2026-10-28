import { defineConfig } from "vitest/config";

/** Local Vitest config for the `@mapomodule/ai` package tests. */
export default defineConfig({
  test: {
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";

/**
 * The evaluation set with a model, apart from the tests: it calls a
 * provider, so it runs only when asked, with `pnpm --filter
 * @mapomodule/ai eval` (see `models.eval.ts`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["eval/**/*.eval.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});

import type { Environment } from "vitest/environments";

/**
 * Node, with modules transformed for the client instead of for SSR. The `node`
 * environment compiles `.vue` files to an SSR render function, which only
 * `renderToString` can run, and SSR stops every watcher after its first run.
 * Compiled for the client, a component can be mounted with a headless renderer
 * and keeps reacting to events. `vitest.config.ts` assigns it to the
 * `*.component.test.ts` files.
 */
export default {
  name: "node-client",
  viteEnvironment: "client",
  setup: () => ({ teardown: () => {} }),
} satisfies Environment;

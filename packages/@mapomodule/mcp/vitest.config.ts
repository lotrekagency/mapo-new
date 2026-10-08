import { defineConfig } from "vitest/config";

/** Local Vitest config for the `@mapomodule/mcp` package tests. */
export default defineConfig({
  test: {
    environment: "node",
    // The CLI integration test spawns a child process and does an MCP handshake.
    testTimeout: 20000,
  },
});

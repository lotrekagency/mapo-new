import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    { input: "src/module", name: "module" },
    { input: "src/index", name: "index" },
    // Standalone stdio CLI (`mapo-mcp`), bundled so it runs without Nuxt.
    { input: "src/cli", name: "cli" },
  ],
  declaration: true,
  rollup: {
    emitCJS: false,
  },
  externals: [
    "@nuxt/kit",
    "@nuxt/schema",
    "@nuxtjs/mcp-toolkit",
    "@nuxtjs/mcp-toolkit/server",
    "@modelcontextprotocol/sdk",
    "nuxt",
    "vue",
    "zod",
  ],
});

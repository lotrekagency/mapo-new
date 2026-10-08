import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    { input: "src/module", name: "module" },
    { input: "src/index", name: "index" },
    // Standalone stdio CLI (`mapo-mcp`), bundled so it runs without Nuxt.
    { input: "src/cli", name: "cli" },
    // Knowledge generator, run only by `scripts/build-knowledge.mjs`. Kept
    // apart so its source-reading devDependencies (vue-component-meta,
    // typescript, jiti) stay out of the runtime bundles.
    { input: "src/build/index", name: "build" },
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
    "typescript",
    "vue-component-meta",
    "jiti",
  ],
});

// https://nuxt.com/docs/api/configuration/nuxt-config

// The AI lab (app/pages/ai/ollama/[id].vue): a local model through the AI
// gateway, off unless the dev server starts with EXAMPLE_OLLAMA_MODELS, the
// models to offer, the first the default, such as "gemma4:12b,qwen3.8:27b".
// server/plugins/mapo-ai-ollama.ts registers the provider it enables.
const ollamaModels = (process.env.EXAMPLE_OLLAMA_MODELS ?? "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  modules: ["@nuxt/ui", "mapomodule"],
  // componentInspector is disabled: its vite-plugin-vue-tracer injects a
  // relative import of `client/record.mjs` into Nuxt's `virtual:nuxt:` modules
  // (e.g. the generated layout wrapper), and that path does not resolve under
  // pnpm's isolated node_modules layout, breaking the dev server.
  devtools: { enabled: true, componentInspector: false },

  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",

    // MCP server for AI assistants. It turns itself on in development anyway;
    // what is configured here is the backend schema the tools read.
    // `api-schema.json` is this app's own mock API described the way
    // drf-spectacular would, so `mapo_backend_schema` has something real to map.
    mcp: {
      backend: {
        schemaUrl: "api-schema.json",
        // Only the *name* of the env var: the value never reaches the build
        // output or a tool response. The mock API needs no token.
        tokenEnv: "MAPO_BACKEND_TOKEN",
      },
    },

    // AI-assisted data entry (experimental). Opt-in: the block installs the
    // module, and the gateway answers under /_mapo/ai/ to a signed-in user;
    // superusers (the `admin` account) administer the AI by default. `run`
    // calls the mock provider: no network, no key, no cost. Its timeout is
    // short, so the "Timeout" sample of /ai/fill fails in 15 seconds. The
    // rules of every prompt are in `instructions`; the rules that depend on
    // the request, and who may use the AI, in server/plugins/mapo-ai-rules.ts;
    // the mock's answers in server/plugins/mapo-ai-fixtures.ts. With
    // EXAMPLE_OLLAMA_MODELS, `run` can also call a local model (the AI lab).
    ai: {
      providers: {
        mock: { timeout: 15 },
        // The AI lab's provider, with a local model's slow first answer in mind.
        ...(ollamaModels.length
          ? { "example-ollama": { models: ollamaModels, timeout: 900 } }
          : {}),
      },
      instructions: {
        all: "The records are the pages of a city magazine: articles about the city, its people and its services.",
      },
    },

    i18n: {
      defaultLocale: "en",
      // `file` points at i18n/locales/<file>: those messages are deep-merged on
      // top of Mapo's own catalogs, which is how the /i18n page overrides
      // `mapo.listTable.noItems` without touching anything else.
      locales: [
        { code: "en", language: "en-US", name: "English", file: "en.json" },
        { code: "it", language: "it-IT", name: "Italiano", file: "it.json" },
      ],
    },
  },
});

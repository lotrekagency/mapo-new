// https://nuxt.com/docs/api/configuration/nuxt-config

// The AI lab (app/pages/ai/ollama/[id].vue): a local model through the AI
// gateway, off unless the dev server starts with EXAMPLE_OLLAMA_MODELS, the
// models to offer, the first the default, such as "gemma4:12b,qwen3.8:27b".
// It enables two providers with them: Mapo's own `ollama`, and the app's
// `example-ollama`, which server/plugins/mapo-ai-ollama.ts registers.
// EXAMPLE_OLLAMA_URL is Ollama's address, when it is not the default.
const isDevelopment = process.env.NODE_ENV !== "production";
const ollamaURL = process.env.EXAMPLE_OLLAMA_URL;
const ollamaModels = (process.env.EXAMPLE_OLLAMA_MODELS ?? "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

// The AI lab for cloud models (app/pages/ai/cloud/[id].vue): Mapo's
// `openai` and `anthropic` providers, each on when the dev server has its
// key, which Mapo reads from the environment at runtime and never from this
// file. Only whether a key is there is read here: every call costs money.
const hasOpenAiKey = Boolean(process.env.NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY);
const hasAnthropicKey = Boolean(
  process.env.NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY,
);

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
    // EXAMPLE_OLLAMA_MODELS, `run` can also call a local model, and with a
    // key, OpenAI's or Anthropic's models (the AI labs).
    ai: {
      providers: {
        mock: { timeout: 15 },
        // The keys lab (/ai/keys): the app's provider that calls no model and
        // says which key the gateway's chain gave it
        // (server/plugins/mapo-ai-keys.ts). Its project's key, if any, comes
        // from NUXT_MAPO_AI_PROVIDERS_EXAMPLE_KEYS_API_KEY.
        "example-keys": { timeout: 15 },
        // The AI lab's providers, with a large form on a 27B model in mind:
        // more than the 600 seconds a local provider of Mapo gets by default.
        ...(ollamaModels.length
          ? {
              ollama: {
                models: ollamaModels,
                timeout: 900,
                ...(ollamaURL ? { baseURL: ollamaURL } : {}),
              },
              "example-ollama": { models: ollamaModels, timeout: 900 },
            }
          : {}),
        // Mapo's defaults: their models, 300 seconds, a low effort and no
        // prompt cache, each changed from the environment
        // (NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_PROMPT_CACHE=true).
        ...(hasOpenAiKey ? { openai: {} } : {}),
        ...(hasAnthropicKey ? { anthropic: {} } : {}),
      },
      instructions: {
        all: "The records are the pages of a city magazine: articles about the city, its people and its services.",
      },
      // The module's AI settings page lives in apps/example-ai: here the keys
      // lab (/ai/keys) shows the same routes as they are.
      settings: { path: false },
      // Links are on, and the gateway refuses the server's own addresses:
      // in development it may read this app's own pages, as the AI panels'
      // sample link does (app/components/ai/AiSourceFile.vue). Another
      // port: NUXT_MAPO_AI_WEB_ALLOW='["localhost:3100"]'.
      ...(isDevelopment ? { web: { allow: ["localhost:3000"] } } : {}),
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

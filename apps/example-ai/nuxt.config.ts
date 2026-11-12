// https://nuxt.com/docs/api/configuration/nuxt-config

// Ollama's models, the first the default, such as "gemma4:12b,qwen3.8:27b":
// Mapo's `ollama` provider offers no model of its own, so it is on only when
// the dev server starts with EXAMPLE_OLLAMA_MODELS. Ollama's address, when it
// is not http://localhost:11434, comes from
// NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL.
const ollamaModels = modelsOf(process.env.EXAMPLE_OLLAMA_MODELS);

// The models of a server that speaks OpenAI's Chat Completions API, such as
// LM Studio, vLLM or llama.cpp's: Mapo's `openai-compatible` provider is on
// only when the dev server starts with EXAMPLE_OPENAI_COMPATIBLE_MODELS, at
// LM Studio's address unless NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_BASE_URL
// gives another. For Ollama, `ollama` above: it refuses a prompt too long
// for the model, where an OpenAI-compatible server may cut it in silence.
const compatibleModels = modelsOf(process.env.EXAMPLE_OPENAI_COMPATIBLE_MODELS);

// Links are on, and the gateway refuses the server's own addresses: in
// development it may read this app's own pages, as the tour's links to the
// files of public/ai-files/ do.
const isDevelopment = process.env.NODE_ENV !== "production";

/** A list of models written as "a,b". */
function modelsOf(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  modules: ["@nuxt/ui", "mapomodule"],
  // componentInspector is off for the same reason as in example-e2e: its
  // tracer injects an import that does not resolve under pnpm's layout.
  devtools: { enabled: true, componentInspector: false },

  mapo: {
    // The app's own small mock backend (server/api/**): the session, the
    // signed-in user, and the users and groups the AI settings page searches.
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",

    // The form's groups start closed: the event's "Streaming" and "Search
    // and social" (app/utils/eventForm.ts) open with a click, or when
    // Magic Fill's "Next to check" brings a value of theirs into view.
    form: { groups: { expanded: false } },

    // AI-assisted data entry (experimental). This block alone installs the
    // module, and with it the AI settings page (/ai-settings, in the
    // sidebar's footer). The providers are the ones a real project enables:
    // OpenAI's and Anthropic's models, whose keys come from the server's
    // environment (NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY,
    // NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY) or from the keys the AI's
    // admins assign on the settings page, never from this file; and Ollama's,
    // with EXAMPLE_OLLAMA_MODELS, and a server of models such as LM Studio,
    // with EXAMPLE_OPENAI_COMPATIBLE_MODELS. No mock: a provider without a
    // key says so.
    ai: {
      // adminModels lets the AI's admins add a model on the settings page
      // ("How the AI works"), once the provider's server lists it.
      providers: {
        openai: { adminModels: true },
        anthropic: { adminModels: true },
        ...(ollamaModels.length ? { ollama: { models: ollamaModels } } : {}),
        ...(compatibleModels.length
          ? {
              "openai-compatible": {
                baseURL: "http://localhost:1234/v1",
                models: compatibleModels,
              },
            }
          : {}),
      },
      // Who may use the AI: superusers, the AI's admins and the groups
      // named here; `viewer`, in no group, gets `allowed: false`. The app's
      // `mapo-ai:user` hook narrows it further: it keeps out the accounts
      // the backend marks external, as `contractor`
      // (server/plugins/mapo-ai-rules.ts).
      users: { groups: ["editors", "reporters"] },
      // The app's rules, in every prompt after Mapo's own and before the
      // admins' instructions of the settings page: "What I send to the AI"
      // shows them. The `mapo-ai:prompt` hook adds one for events.
      instructions: {
        all: "The records are the articles, pages and events of a city's culture office, in Milan.",
        extract:
          "A programme lists one event per row or per heading: an event that repeats on several days is one event per day.",
      },
      // The prices of the models the app enables, for the costs of the
      // usage on the settings page: list prices in dollars per million
      // tokens, read on 2026-11-05, as the AI lab of example-e2e has them.
      // A real project writes those of its own contract; Mapo keeps none.
      prices: {
        currency: "USD",
        providers: {
          openai: {
            "gpt-6.1-sol": {
              input: 2,
              output: 10,
              cacheRead: 0.1,
              cacheWrite: 2.5,
            },
            "gpt-6-luna": {
              input: 0.1,
              output: 0.5,
              cacheRead: 0.01,
              cacheWrite: 0.125,
            },
          },
          anthropic: {
            "claude-opus-5-5": {
              input: 4,
              output: 20,
              cacheRead: 0.2,
              cacheWrite: 5,
            },
            "claude-sonnet-5-5": {
              input: 2,
              output: 10,
              cacheRead: 0.2,
              cacheWrite: 2.5,
            },
            "claude-haiku-5-5": {
              input: 0.1,
              output: 0.5,
              cacheRead: 0.01,
              cacheWrite: 0.125,
            },
          },
        },
      },
      // The backend's users and groups, which the settings page searches
      // when an admin assigns a key (server/api/users, server/api/groups).
      settings: { usersApi: "/api/users/", groupsApi: "/api/groups/" },
      ...(isDevelopment ? { web: { allow: ["localhost:3002"] } } : {}),
    },
  },
});

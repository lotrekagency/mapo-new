// https://nuxt.com/docs/api/configuration/nuxt-config

// Ollama's models, the first the default, such as "gemma4:12b,qwen3.8:27b":
// Mapo's `ollama` provider offers no model of its own, so it is on only when
// the dev server starts with EXAMPLE_OLLAMA_MODELS. Ollama's address, when it
// is not http://localhost:11434, comes from
// NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL.
const ollamaModels = (process.env.EXAMPLE_OLLAMA_MODELS ?? "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

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

    // AI-assisted data entry (experimental). This block alone installs the
    // module, and with it the AI settings page (/ai-settings, in the
    // sidebar's footer). The providers are the ones a real project enables:
    // OpenAI's and Anthropic's models, whose keys come from the server's
    // environment (NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY,
    // NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY) or from the keys the AI's
    // admins assign on the settings page, never from this file; and Ollama's,
    // with EXAMPLE_OLLAMA_MODELS. No mock: a provider without a key says so.
    ai: {
      // adminModels lets the AI's admins add a model on the settings page
      // ("How the AI works"), once the provider's server lists it.
      providers: {
        openai: { adminModels: true },
        anthropic: { adminModels: true },
        ...(ollamaModels.length ? { ollama: { models: ollamaModels } } : {}),
      },
      // The backend's users and groups, which the settings page searches
      // when an admin assigns a key (server/api/users, server/api/groups).
      settings: { usersApi: "/api/users/", groupsApi: "/api/groups/" },
    },
  },
});

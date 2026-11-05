# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. **Experimental**: today the module installs the AI gateway on the app's Nitro server, with an encrypted storage for its state. The gateway answers signed-in users: `GET /_mapo/ai/status`, and `POST /_mapo/ai/run`, which asks a provider to fill a record from a source, or to extract the records it describes, and answers one outcome per field. Mapo ships a mock, providers for OpenAI's and Anthropic's models, and providers for models on your own servers, through Ollama or an OpenAI-compatible server; an app can register its own. In the app's components, `useMapoAiFill()` fills a detail form through `run`: it writes each value a quote of the source verifies into an empty field, and leaves every other one to the operator. Routes, responses and options can change in any release while the package is experimental.

## Installation

Installed by the meta-package [`mapomodule`](https://www.npmjs.com/package/mapomodule) when the app sets the `mapo.ai` key; without it, nothing of this package is loaded:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],

  mapo: {
    ai: {},
  },
});
```

On its own it reads the `mapoAi` key:

```bash
pnpm add @mapomodule/ai@next
```

The gateway knows the user from the backend session, through `userInfoApi`; the options `admin` and `users` say who administers the AI and who may use it, and `providers` which providers `run` may call. Its state is sealed with a secret of at least 32 characters, set at runtime in the server's environment: `NUXT_MAPO_AI_SECRET` (for example `openssl rand -base64 32`). Mapo v2 is published on the `next` dist-tag while it is in beta.

## Documentation

- [AI-assisted entry](https://lotrekagency.github.io/mapo-new/modules/ai)
- [Concepts](https://lotrekagency.github.io/mapo-new/guide/concepts): the packages and how they fit together

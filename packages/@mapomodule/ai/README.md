# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. **Experimental**: today the module installs the AI gateway on the app's Nitro server, with an encrypted storage for its state, and the gateway answers one route, `GET /_mapo/ai/status`, to signed-in users. Routes, responses and options can change in any release while the package is experimental.

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

The gateway knows the user from the backend session, through `userInfoApi`; the options `admin` and `users` say who administers the AI and who may use it. Its state is sealed with a secret of at least 32 characters, set at runtime in the server's environment: `NUXT_MAPO_AI_SECRET` (for example `openssl rand -base64 32`). Mapo v2 is published on the `next` dist-tag while it is in beta.

## Documentation

- [AI-assisted entry](https://lotrekagency.github.io/mapo-new/modules/ai)
- [Concepts](https://lotrekagency.github.io/mapo-new/guide/concepts): the packages and how they fit together

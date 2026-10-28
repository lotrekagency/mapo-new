# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. **Experimental**: today the module installs the AI gateway on the app's Nitro server, and the gateway answers one route, `GET /_mapo/ai/status`. Routes, responses and options can change in any release while the package is experimental.

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

The module has no options yet. Mapo v2 is published on the `next` dist-tag while it is in beta.

## Documentation

- [AI-assisted entry](https://lotrekagency.github.io/mapo-new/modules/ai)
- [Concepts](https://lotrekagency.github.io/mapo-new/guide/concepts): the packages and how they fit together

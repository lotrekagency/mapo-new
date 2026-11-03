# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. Its purpose: an operator hands Mapo a source, such as a text, a document or a spreadsheet, a language model proposes the values of a form, and the operator reviews them before anything is saved.

::: warning Experimental
The package is at its first building block. Today it installs the **AI gateway** on your app's server, and the gateway answers one route, `status`. No form filling, no providers and no options exist yet. Routes, responses and options can change in any release while the package is experimental.
:::

## What works today

- The module installs only when the app asks for it: an app without the `mapo.ai` key loads nothing of it.
- The gateway answers `GET /_mapo/ai/status` with the version of its contract.
- `mapomodule/types` exports `MapoAiOptions` and `MapoAiStatus`.

How the module is built, what its shared core already does and what comes next are described, for people who work on Mapo, in [Working on the AI module](/contributing/ai-module).

## Enable the module

With the meta-package, set the `mapo.ai` key. An empty block is enough:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],

  mapo: {
    ai: {},
  },
});
```

Without the key, or with `ai: false`, the meta-module skips the package entirely: no module, no routes.

On its own, install the package and register it; it then reads the `mapoAi` key:

```bash
pnpm add @mapomodule/ai@next   # @next: Mapo v2 is in beta
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/ai"],
});
```

## The gateway

The gateway is a set of routes on your app's own Nitro server, under `/_mapo/ai/`. The prefix sits outside `/api/*` on purpose: a backend integration that proxies `/api` to the real backend never catches these routes. In an app served under a base URL, the routes move with it: with `app.baseURL: "/backoffice/"` the status route is `/backoffice/_mapo/ai/status`.

| Route                  | Answer                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `GET /_mapo/ai/status` | `{ "contract": 1 }`: the version of the gateway's contract |

The contract version goes up when a route or a response changes in a way an older client cannot read. `status` gives every caller the same answer and carries no configuration and no user data.

```ts
import type { MapoAiStatus } from "mapomodule/types";

const status = await $fetch<MapoAiStatus>("/_mapo/ai/status");
```

## Options

None yet. Setting `mapo.ai` (or `mapoAi`) installs the module and turns the gateway on.

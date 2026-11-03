# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. Its purpose: an operator hands Mapo a source, such as a text, a document or a spreadsheet, a language model proposes the values of a form, and the operator reviews them before anything is saved.

::: warning Experimental
The package is at its first building blocks. Today it installs the **AI gateway** on your app's server, with an encrypted storage for the gateway's state. The gateway answers one route, `status`, and no route stores anything yet. No form filling, no providers and no options exist yet. Routes, responses and options can change in any release while the package is experimental.
:::

## What works today

- The module installs only when the app asks for it: an app without the `mapo.ai` key loads nothing of it.
- The gateway answers `GET /_mapo/ai/status` with the version of its contract.
- The gateway has an encrypted storage on the server, the Nitro mount `mapo-ai`, sealed with the secret `NUXT_MAPO_AI_SECRET`. The server checks the secret and the mount when it starts, and sweeps expired records every hour. No route writes to it yet.
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

## The secret and the storage

The gateway keeps its state on your app's server, in the Nitro storage mount `mapo-ai`. Every record is encrypted (AES-256-GCM) before it reaches the storage driver, with a key derived from a secret you set, so the files or keys of the storage hold no readable value and no user id; only the records' names (such as `openai`, or a batch's id) and their expiry stay in clear. No route writes to the storage yet, but the server already checks the secret and the mount when it starts.

### Set the secret

Give the server a random secret of at least 32 characters, in its environment. Make it with a generator, not by hand: with a copy of the storage, a secret that can be guessed can be tested offline.

```bash
# .env in development, the server's environment in production
NUXT_MAPO_AI_SECRET=<the output of: openssl rand -base64 32>
```

Set it at runtime only. The variable fills `runtimeConfig.mapoAi.secret`, which the module declares, empty and private. A value written there in `nuxt.config.ts` is copied into the server bundle at build time, and the module warns when it finds one.

| The secret                              | `nuxt dev`                                                                                              | Production                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Set, 32 characters or more              | Used                                                                                                    | Used                                                                                           |
| Not set                                 | A temporary secret, made at every start: the state lasts until the server restarts, and the log says so | The storage is closed: no value is read or written, and the log says so when the server starts |
| Shorter than 32 characters, or not text | The storage is closed                                                                                   | The storage is closed                                                                          |

The storage never falls back to keeping the state in clear. A value that the environment turns into a number, a boolean or JSON counts as not text. Without a secret, `nuxt dev` also loses the state each time it reloads after a change to the server's code, such as a file in `server/`: each reload runs the server in a new worker, with a new temporary secret.

Changing the secret makes the stored state unreadable. A record that does not open is skipped, with a warning in the log, and left in place: it stays until it expires or is replaced, and putting the old secret back opens it again. The records of a user are also filed under a name derived from the secret, so with a new secret they are no longer found. Keep the secret as you keep a database password; to start again with a new one, empty the storage.

### Where the state is kept

Unless the app mounts its own driver at `mapo-ai`, the module mounts the file system where the server runs on Node:

| Where the server runs                           | The folder                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `nuxt dev`                                      | `.data/mapo-ai` in the app's root, as for Nitro's own `data` mount             |
| A Node server (`node .output/server/index.mjs`) | `./.data/mapo-ai`, from the directory the server starts in                     |
| A preset without Node (edge runtimes)           | None: the storage is closed until the app mounts a driver, and the log says so |

Serverless functions that run on Node, such as the `vercel`, `netlify` and `aws-lambda` presets, get the folder too, but a function's file system does not keep it: mount a driver there. In a container, put `.data/mapo-ai` on a persistent volume, or the state is lost at every deploy. Several instances need one shared storage and the same secret: a volume they all see, or a networked driver such as Redis.

Another driver is mounted as for any [Nitro storage](https://nitro.build/guide/storage). When its settings are known at build time, mount it in the Nuxt config; Nitro uses it in development too, unless `nitro.devStorage` mounts another driver there:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    storage: {
      "mapo-ai": { driver: "redis", host: "redis", port: 6379 },
    },
  },
});
```

A mount in `nitro.devStorage` counts in development only: on the server the module's default applies, as for Nitro's own `data` mount.

When the driver's settings come from the environment, such as a password, mount it in a Nitro plugin of the app, which runs when the server starts. It first removes the module's default:

```ts
// server/plugins/mapo-ai-storage.ts
import redisDriver from "unstorage/drivers/redis";

export default defineNitroPlugin(async () => {
  const storage = useStorage();
  await storage.unmount("mapo-ai"); // the module's file-system default, if any
  storage.mount("mapo-ai", redisDriver({ url: process.env.REDIS_URL }));
});
```

The module checks the storage right after the app's plugins have run, so it finds the driver this plugin mounts. A plugin that mounts only after a network call, such as fetching a password, comes too late for that check: the startup log may report the storage as closed, and the first sweep waits for the next hourly round.

### Expiry

A record can carry an expiry. An expired record is never returned: it is removed when it is read, and the server sweeps the expired records when it starts and every hour. The sweep reads only each record's expiry, which is stored in clear beside the encrypted value, so it needs no secret: it runs even while the storage is closed for lack of a usable secret. A driver that expires keys on its own, such as Redis, is given the same expiry. Where the runtime allows no timer while the server starts, there is no sweep: expired records go when they are read, and the checks run at the first request.

## Options

None yet. Setting `mapo.ai` (or `mapoAi`) installs the module and turns the gateway on. The secret is not an option: it is the environment variable `NUXT_MAPO_AI_SECRET`, read when the server starts.

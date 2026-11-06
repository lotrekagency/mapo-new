# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. Its purpose: an operator hands Mapo a source, such as a text, a document or a spreadsheet, a language model proposes the values of a form, and the operator reviews them before anything is saved.

::: warning Experimental
The package is at its first building blocks. It installs the **AI gateway** on your app's server, with an encrypted storage for the gateway's state. The gateway tells a signed-in user what it offers them (`status`), reads a file into text (`read`), asks a provider to fill a record or to extract the records of a source (`run`), answering what the AI proposes, checked field by field, and keeps the keys of the providers on three levels (`keys`, `token`). Mapo ships five providers: `mock`, which answers without a network; `openai` and `anthropic`, for OpenAI's and Anthropic's models; and `ollama` and `openai-compatible`, for models served on your own servers; an app can register its own. In the browser, `useMapoAiRead()` sends a file to `read` and `useMapoAiFill()` fills a detail form through `run`, from components the app writes: Mapo ships no panel of its own. Routes, responses and options can change in any release while the package is experimental.
:::

## What works today

- The module installs only when the app asks for it: an app without the `mapo.ai` key loads nothing of it.
- The gateway knows the user from the backend session: it forwards the request's cookie to `userInfoApi`, as Mapo does when it renders a page. Without a session it answers 401.
- `GET /_mapo/ai/status` tells a signed-in user the version of the gateway's contract, whether the app lets them use the AI and whether they administer it, and the providers, models, limits and readers they get; an admin also gets the state of the storage.
- Two options say who administers the AI and who may use it, `admin` and `users`, and a Nitro plugin can narrow it further with the `mapo-ai:user` hook.
- `POST /_mapo/ai/run` fills one record (`fill`) or extracts every record a source describes (`extract`). The page sends the record's two descriptions, its backend schema and its form's fields, and the source; the gateway builds what the AI may fill, composes the prompt, calls the provider and reads its answer: each field comes back empty, filled (verified by a quote of the source, or to check) or discarded with a reason. The gateway never writes to the backend.
- The module adds an **AI settings** page (`/ai-settings`), also a component, `MapoAiSettings`: each user picks their provider and model, sees their key, saves their own token where allowed and checks the connection; the AI's admins assign keys to everyone, a group or a user.
- The AI's admins change how the AI works in the whole app, on the same page: their instructions in every prompt, the rules of verification, the words that name a secret field, each cloud provider's prompt cache, Anthropic's fallbacks, and models they add where the app allows it (`adminModels`). The app's options stay the defaults; nothing the admins set removes Mapo's rules.
- The keys come from three levels, nearest to the user first: the user's own token, where an admin allows one; the key the AI's admins assign to the user, to one of their groups or to everyone, with the models it opens; the project's key, in the server's environment. The browser never sees a key: `status` says which level gives it.
- The providers `run` may call are the ones `providers` enables: Mapo's `mock`, which answers from fixtures, from lines such as `Title: About us`, or with a failure on command; `openai`, OpenAI's models through its Responses API; `anthropic`, Claude through Anthropic's Messages API; `ollama`, a model served by Ollama; `openai-compatible`, a model served by LM Studio, vLLM, llama.cpp or another server that speaks OpenAI's Chat Completions API; and the ones an app registers with `registerMapoAiProvider()`.
- `POST /_mapo/ai/read` reads a file into the text `run` takes, with the reader of its format: text, Markdown, JSON, HTML, CSV and XLSX. An app puts its own reader in place of any of Mapo's or adds one (`registerMapoAiReader()`), touches up what any reader read (the `mapo-ai:read` hook), and turns a format off without code (`readers`). In the browser, `useMapoAiRead()` sends a file.
- The prompt is composed in layers: Mapo's base rules, the app's (`instructions`, and the `mapo-ai:prompt` hook), the entity's context, the operator's instructions, then the source, which is data and never instructions.
- The app sets the verification rules (`verification`) and the limits (`limits`): calls per user per minute, the length of a source and of the operator's instructions, the size of a file.
- Every call that reaches a provider is audited in the storage: who, when, which provider and model answered, the tokens (those of the provider's prompt cache among them) and the outcome, never the contents, for 90 days by default (`audit`).
- `useMapoAiFill()`, auto-imported in the app's components, fills a detail form through `run`: it sends the form's fields and the backend's schema from `OPTIONS`, writes each value a quote verifies into an empty field, and marks the others on their fields for the operator to apply, choose or ignore. `undo()` puts back what it wrote; nothing is saved until the operator saves.
- The gateway has an encrypted storage on the server, the Nitro mount `mapo-ai`, sealed with the secret `NUXT_MAPO_AI_SECRET`. The server checks the secret and the mount when it starts, and sweeps expired records every hour.
- `mapomodule/types` exports `MapoAiOptions`, `MapoAiStatus`, the types of `run` (`MapoAiRunRequest`, `MapoAiRunResponse` and the outcomes, `AiFieldOutcome`), of `useMapoAiFill()` (`MapoAiFill`, `MapoAiFillTarget`, `MapoAiFillField`), of `read` (`MapoAiReadResponse`, `MapoAiReader`), of the providers (`MapoAiProvider`, `MapoAiMockFixture`), of the keys and the settings (`MapoAiKeyStatus`, `MapoAiKeyAssignment`, `MapoAiKeysAnswer`, `MapoAiPreference`, `MapoAiTestResponse`, `MapoAiSettingsAnswer`, `MapoAiSettingsInput`, `MapoAiPreviewResponse`) and of the hooks (`MapoAiUserContext`, `MapoAiPromptContext`, `MapoAiReadContext`).

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

Register it one way or the other. With `@mapomodule/ai` in `modules` beside `mapomodule`, the meta-module does not install it a second time, so the module reads `mapoAi` and the options in `mapo.ai` never reach it; the meta-module warns about it when `mapo.ai` holds options.

## The gateway

The gateway is a set of routes on your app's own Nitro server, under `/_mapo/ai/`. The prefix sits outside `/api/*` on purpose: a backend integration that proxies `/api` to the real backend never catches these routes. In an app served under a base URL, the routes move with it: with `app.baseURL: "/backoffice/"` the status route is `/backoffice/_mapo/ai/status`.

| Route                  | Answer                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /_mapo/ai/status` | The version of the gateway's contract, whether the app lets the user use the AI and whether they administer it; to a user the app lets in, the `providers` with their models, the `default`, the `limits` and the `readers`; to an admin, also `storage` |
| `POST /_mapo/ai/read`  | The text of a file, as `run` takes it, or why there is none ([Read a file](#read-a-file))                                                                                                                                                                |
| `POST /_mapo/ai/run`   | What the AI proposes for a record, or for the records of a source, read field by field ([Ask the AI](#ask-the-ai))                                                                                                                                       |
| `/_mapo/ai/keys`       | For the AI's admins: the keys they assign to everyone, a group or a user, the models they open, and the order of the groups ([Keys](#keys))                                                                                                              |
| `/_mapo/ai/token`      | The user's own token for a provider, where an admin's assignment allows one ([Personal tokens](#personal-tokens))                                                                                                                                        |
| `/_mapo/ai/test`       | Checks a provider's connection with the user's key, at no cost; `PUT` and `DELETE /_mapo/ai/preferences` save and remove the user's provider and model ([AI settings](#ai-settings))                                                                     |

The contract version goes up when a route or a response changes in a way an older client cannot read. The answers are the user's own, so they carry `Cache-Control: no-store`.

```ts
import type { MapoAiStatus } from "mapomodule/types";

// In the browser the session cookie goes along with the request. During SSR
// $fetch sends no cookie: use $mapoFetch there, which forwards it.
const status = await $fetch<MapoAiStatus>("/_mapo/ai/status");
```

To a user the app lets in, `providers` lists what `run` may call for them, with the models they may ask for and, for a provider that calls with a key, where their key comes from (`key`, [Keys](#keys)), `default` what it calls when a request names nothing (the user's `preference` when they may still call it, [AI settings](#ai-settings)), `limits` the limits of `run` and `read` ([Limits](#limits)), and `readers` the formats `read` takes, the app's readers first ([Read a file](#read-a-file)). An empty `providers`, and no `default`, means `run` has no provider to call. To an admin, `storage` says whether the gateway can read and write its state, and why not, never the secret itself:

```json
{
  "contract": 2,
  "allowed": true,
  "admin": true,
  "storage": {
    "open": true,
    "secret": "set",
    "mounted": true,
    "driver": "fs-lite"
  },
  "providers": [{ "id": "mock", "label": "Mock", "models": ["mock"] }],
  "default": {
    "provider": "mock",
    "models": { "fill": "mock", "extract": "mock" }
  },
  "limits": {
    "perUserPerMinute": 20,
    "maxSourceChars": 100000,
    "maxInstructionsChars": 2000,
    "maxFileBytes": 10485760
  },
  "readers": [
    {
      "id": "text",
      "label": "Text",
      "extensions": ["txt"],
      "types": ["text/plain"]
    },
    {
      "id": "csv",
      "label": "CSV",
      "extensions": ["csv", "tsv"],
      "types": ["text/csv", "text/tab-separated-values"]
    }
  ]
}
```

`secret` is `set`, `temporary` (none is set and the server runs in development), or what keeps the storage closed: `missing`, `too-short` or `not-text` ([The secret and the storage](#the-secret-and-the-storage)). `driver` is the name of the driver mounted at `mapo-ai`, when it has one: `fs` with the module's default in `nuxt dev`, `fs-lite` on a Node server. `readers` lists every reader that is on, the app's first: the example is cut to two of Mapo's six.

### A user the app refuses

`status` answers every signed-in user, also one the app's rules refuse ([Restrict who uses the AI](#restrict-who-uses-the-ai)). That user gets the `contract`, `"allowed": false` and `"admin": false`, with a 200, and nothing more: no `storage`, `providers`, `default`, `limits` or `readers`. Every other route of the gateway refuses them with 403.

It is an answer and not an error on purpose. A page asks `status` to know whether to offer the AI at all, and "not for you" is a normal answer to that question. As a 403, every page that asks would have to handle an error for a user who did nothing wrong, and through `$mapoFetch` Mapo would show its permission-denied message on each of those pages. With `allowed`, a page asks and leaves the AI out:

```ts
import type { MapoAiStatus } from "mapomodule/types";

const { fetch } = useMapoFetch();
const { allowed } = await fetch<MapoAiStatus>("/_mapo/ai/status");
```

Every route of the gateway answers these errors:

| Status | When                                                                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | Nobody is signed in: the request has no cookie, or the backend refuses its session                                                                                                                                                  |
| 403    | The app's rules refuse the user: `users`, or a `mapo-ai:user` hook ([Who may use the gateway](#who-may-use-the-gateway)). `status` answers that user `"allowed": false` instead ([A user the app refuses](#a-user-the-app-refuses)) |
| 502    | The backend cannot say who is signed in: it cannot be reached, it fails, or `userInfoApi` returns no user. The server's log says why, and the session is not touched                                                                |

The routes that change something, `read`, `run` and the routes of the keys and the token, also refuse with 403 a request a browser marks as sent from another origin (`Sec-Fetch-Site` other than `same-origin`). The routes of the keys are for the AI's admins: anyone else gets a 403. Called with `$mapoFetch`, these errors behave as for any backend call: a 401 sends the user to the login page, and a 403 shows Mapo's permission-denied message. `run` and `read` have errors of their own ([Errors of run](#errors-of-run), [What read answers](#what-read-answers)).

## Who may use the gateway

### The session

The gateway does not log anybody in: it asks your backend who the request's session belongs to. It forwards the request's `cookie` header, and no other header, to [`userInfoApi`](/modules/core#options) (`/api/profiles/me/` by default), through your app's own server, the way Mapo restores the session when it renders a page. The proxy of a backend integration sees that call and handles its cookies as it does for any other, and in an app served under a base URL the call goes there too. A backend that answers 401, or 403 as Django REST Framework's session authentication answers a request without a session, means nobody is signed in.

The user is the object `userInfoApi` returns: an `id`, `is_superuser: true` for a superuser, the strings of `groups`, and the permission codenames of `all_permissions`, or of `user_permissions` when the first is missing, read as Mapo's auth store reads them. A payload without an `id` is no user, and the gateway answers 502. Only `is_superuser: true` makes a superuser of the gateway, while Mapo's pages, which only decide what to show, count any true value: a backend that sends `1` gets a superuser's pages but not a superuser's AI. With Django REST Framework's booleans the two agree.

The gateway remembers a user for 30 seconds, in the memory of the server process and under a hash of the cookie: a burst of calls asks the backend once, and a session closed on the backend, or a permission taken away, still counts for up to 30 seconds. Every server process keeps its own memory.

### Admins

`admin` names who administers the AI: superusers always, then anyone in one of its `groups` or with one of its `permissions`, codenames as `userInfoApi` sends them. Without it, only superusers do.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      admin: { groups: ["ai-admin"] },
    },
  },
});
```

An admin assigns keys and models to everyone, a group or a user, and allows personal tokens ([Keys](#keys)), in the [AI settings](#ai-settings) page or through its routes; `status` tells an admin the state of the storage.

### Restrict who uses the AI

Without `users`, every user `userInfoApi` returns may use the gateway. With it, only superusers, the AI's admins and the users it picks may; anyone else is refused: `status` answers them `"allowed": false`, every other route 403.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      users: { groups: ["editors"], permissions: ["change_article"] },
    },
  },
});
```

When the rule is not a group or a permission, add it in a Nitro plugin, with the `mapo-ai:user` hook. A backoffice that lets in only the users its backend marks as internal, for example, gives the gateway the same rule; otherwise a user the backoffice turns away could still call the gateway with their session:

```ts
// server/plugins/mapo-ai-access.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("mapo-ai:user", (context) => {
    if (context.payload.is_internal !== true) context.allowed = false;
  });
});
```

The hook runs on every request the gateway lets in, after `users`, with:

| Field     | What it holds                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`   | The request                                                                                                                                                                                  |
| `user`    | The user as the gateway reads them (`MapoAiUser`): `id`, `username`, `superuser`, `groups`, `permissions`, `models`                                                                          |
| `payload` | The user exactly as `userInfoApi` returned them, with the fields the gateway does not read. Outside data: check a value's type first                                                         |
| `admin`   | Whether the user administers the AI                                                                                                                                                          |
| `allowed` | `true`; set it to `false` to refuse the user. Once a hook refuses, no later hook can let the user back in: setting `true` again changes nothing, and anything but `true` counts as a refusal |

A hook only narrows: a user `users` refuses never reaches it, and the rules of two plugins that each refuse some users both hold. A hook that throws fails the request with a 500, so an error lets nobody in. `user` and `payload` are read-only, so a hook cannot change what the next request reads. The module types the hook in your app's server code.

## Ask the AI

`POST /_mapo/ai/run` asks a provider what a source says about one record (`"task": "fill"`) or about every record it describes (`"task": "extract"`), and answers what the AI proposes, read field by field. The gateway never writes to the backend: the page shows the outcomes, and the operator decides what to save.

### Send the record and the source

The page describes the record with its two descriptions, in Mapo's JSON Schema dialect:

- `fields`, the form's fields, as `fieldsToJsonSchema(fields)` writes them ([From form to JSON Schema](/uikit/form/schema-to-form#from-form-to-json-schema));
- `schema`, the backend's schema, from `OPTIONS`, DRF metadata or an OpenAPI document, normalized by `@mapomodule/utils` ([From DRF metadata and OpenAPI](/uikit/form/schema-to-form#from-drf-metadata-and-openapi)).

One of the two is enough. With both, the form's fields decide which fields exist and of which type, and the stricter limit of the two wins. From them the gateway builds what the AI may fill and the JSON Schema of its answer, with the same code a page can run: a field kept away from the AI (a password, a read-only value, a media, a key named like a secret, a token or credentials, or with one of the app's or the admins' words of secrets, `x-mapo-ai` with `exclude`) is never asked.

```ts
import type { MapoAiRunResponse } from "mapomodule/types";

const { fetch } = useMapoFetch();
const answer = await fetch<MapoAiRunResponse>("/_mapo/ai/run", {
  method: "POST",
  body: {
    task: "fill",
    entity: {
      fields: fieldsToJsonSchema(fields),
      label: "Article",
      model: "article", // the permission asked: change_article here, add_article for a new record
    },
    existing: true,
    language: "it",
    parts: [{ kind: "text", text: pastedText }],
    instructions: "Only the first paragraph.", // the operator's own, optional
  },
});
```

The body:

| Field          | Type                              | What it is                                                                                    |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `task`         | `"fill"` or `"extract"`           | One record, or every record of the source                                                     |
| `entity`       | object, with `fill`               | The record: `fields`, `schema` or both, and what the AI should know about it (below)          |
| `entities`     | list, with `extract`              | The entities the source may describe, up to 20, each with a `type` of its own                 |
| `existing`     | boolean, with `fill`              | The record exists already: the permission asked is `change_` instead of `add_`                |
| `parts`        | `[{ kind: "text", text, name? }]` | The source, 1 to 20 texts; `name`, such as a file's, is where the quotes say they are         |
| `language`     | string                            | The language translatable values are written in, such as `it`                                 |
| `instructions` | string                            | The operator's own instructions for this source                                               |
| `provider`     | `{ id?, model? }`                 | The provider and the model to call, among those `status` lists; the default for each left out |

An entity:

| Field                  | What it is                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`, `schema`     | Its two descriptions; one at least                                                                                                                |
| `exclude`              | Keys the AI never fills: `seo` covers `seo.title`, and `speakers.*.email` the email of every item of `speakers`                                   |
| `type`                 | Its type in an extraction, such as `event`                                                                                                        |
| `label`, `description` | Its name for people, and what a record of it is, for the AI                                                                                       |
| `endpoint`             | Where its records are created; in an extraction, a relation that points there may link to a new item of the same answer                           |
| `relationChoices`      | The records a relation field may point to, by field key, when they are few (250 at most): the AI then picks an id instead of a name to search for |
| `evidence`             | `false` asks for no quotes, and then no value is verified                                                                                         |
| `model`                | The backend model of its records, for the permission check                                                                                        |

### Read the answer

```json
{
  "task": "fill",
  "status": "answered",
  "result": {
    "readable": true,
    "fields": {
      "title": {
        "status": "filled",
        "value": "About us",
        "verified": true,
        "quotes": [{ "quote": "Title: About us", "where": "", "found": true }]
      },
      "summary": { "status": "empty" },
      "status": {
        "status": "discarded",
        "reason": "not-listed",
        "proposed": "archived",
        "quotes": []
      }
    },
    "warnings": []
  },
  "provider": { "id": "mock", "model": "mock" },
  "prompt": 1,
  "usage": { "inputTokens": 397, "outputTokens": 47 }
}
```

Each field the AI was asked has one outcome (`AiFieldOutcome`), by field key: `seo.title` for a field inside an object, and a list's items with their own outcomes, in `items`.

- `empty`: the source does not give it.
- `filled`: `value` has the form's type. `verified` is `true` when a quote of the AI is in the source and holds the value ([Verification](#verification)); `false` means someone should check it.
- `discarded`: the value broke a rule of its field (`reason`: `format`, `not-listed`, `too-long`, `pattern`…), and `proposed` keeps what the AI wrote, for the operator to see.

`readable` is `false` when the answer did not have the shape asked: then every field is empty. `warnings` lists what the gateway could not use. An extraction answers `result.items` instead, each item with its `type`, its `ref` and its `fields`. When the model refuses, `status` is `refused` and `refusal` holds what it wrote instead. `provider` names the provider and the model that answered: another model than the one asked when the provider retried the call on it, as [Anthropic](#anthropic) does when its safety filters decline a request. `prompt` is the version of Mapo's base rules the prompt was composed with, and `usage` the tokens the provider counted: `inputTokens` for the whole prompt, `outputTokens` for the answer with its reasoning and, when the provider's [prompt cache](#the-prompt-cache) was read or written, `cacheReadTokens` and `cacheWriteTokens`, part of `inputTokens`.

### What the gateway checks

In this order, and a request stops at the first refusal:

1. the session and the app's rules (401, 403, 502), and the origin a browser marks the request as coming from (403);
2. the storage: a call that cannot be audited is not made (503);
3. the body: JSON, within the limits, a request of `run` (415, 413, 400);
4. the provider and the model, enabled by the app (503 without any, 403 for another);
5. the user's permission on each entity's `model`: `add_`, or `change_` for an existing record; superusers always pass, and without a `model` nothing is checked;
6. the user's limit per minute, looked at without counting the call (429);
7. what the AI may fill: nothing to fill, two entities of an extraction at one endpoint, or descriptions too large or too deep for the providers get a 422;
8. the app's `mapo-ai:prompt` hooks (a hook that throws fails the request with a 500);
9. the limit counts the call (429 when calls made meanwhile used it up), and the provider is called, within its `timeout`;
10. the audit of the call, as soon as the provider answers, then the answer, read against what was asked.

A request counts against the user's limit only once it reaches step 9, whatever the provider then does.

The permission on the model keeps the gateway in step with an honest page, which offers the AI only where the user may add or change a record. It is not a boundary: a request names the model it wants, or none. What may spend is decided by `users`, the `mapo-ai:user` hook and the limits.

### Errors of run

| Status | When                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| 400    | The body is not JSON, not a request of `run`, or an entity has no description; the message names where, never a value |
| 403    | A provider or a model the app or an admin does not give the user; no permission on the model; another origin          |
| 413    | The body, the source or the instructions exceed the limits, or the prompt does not fit what the model reads           |
| 415    | The body is not `application/json`                                                                                    |
| 422    | The AI may fill nothing, two entities of an extraction share an endpoint, or the descriptions are too large or deep   |
| 429    | The user made `perUserPerMinute` calls in the last minute; `Retry-After` says when to try again                       |
| 502    | The provider failed or refused the request, cut the answer at its cap, or sent nothing the gateway can read           |
| 503    | No provider, no key for it, the storage closed or its keys unreadable, or the provider busy (`Retry-After`)           |
| 504    | The provider did not answer within its `timeout`                                                                      |

A provider that needs a key is refused with a 503 before it is called when no level gives the user one, and every call while the admins' keys cannot be read ([Keys](#keys)). When the provider fails, the answer's `data.failure` names how: `timeout`, `rate-limit`, `unavailable`, `invalid-response`, `refused-request`, `too-long` (413), `truncated` (a cut answer, 502) or `error`. Why it failed goes to the server's log, never to the browser.

## Fill a detail form

`useMapoAiFill()` fills the form of a `MapoDetail` from a source the operator gives, through `run`. It sends the form's fields and the backend's schema of the record, read from the endpoint's `OPTIONS` that the detail asks for once, then applies the answer field by field:

| The answer for a field                                     | In the form                                 | The mark on the field                                 |
| ---------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| A value a quote verifies, and the field is empty and shown | Goes in by itself                           | "Filled by the AI", with the quote; Keep, Restore     |
| A value no quote proves, or one that would replace a value | Waits for the operator                      | "Proposed by the AI", with the value; Apply, Ignore   |
| A related record                                           | Waits: the operator chooses it in the field | "To set by hand", with the AI's name or label; Ignore |
| A value the gateway discarded                              | Never goes in                               | "Discarded", with the value and the reason; Ignore    |
| Nothing: the source does not give it                       | Unchanged                                   | None                                                  |

A field is empty when it holds nothing, a blank text, an empty paragraph or an empty list; `false` and `0` are values. A field the form hides (its `show` or `visible` says so) never takes a value by itself: it waits. A list goes in whole, never item by item, and by itself only when every item is verified and none was taken out. A value goes in as the form writes one: through the field's accessor, in every language for a `synci18n` field, then its `onChange`; a part of a field whose accessor converts its value, such as `seo.title` of such a field, waits to be set by hand. Nothing is saved: the operator reviews the form and saves it with the detail's own Save.

Call it in a detail extension ([Detail page](/uikit/detail#how-to-add-an-action-to-every-detail-page)), with the detail's context:

```vue
<!-- app/components/AiFill.vue, registered with
     defineDetailExtension({ key: "ai-fill", placement: "body-top", component: AiFill }) -->
<script setup lang="ts">
const detail = useMapoDetail();
const ai = detail
  ? useMapoAiFill(detail, { entity: { label: "Article", model: "article" } })
  : undefined;
const source = ref("");
</script>

<template>
  <div v-if="ai" class="space-y-2">
    <UTextarea v-model="source" class="w-full" aria-label="Source" />
    <UButton :loading="ai.pending.value" @click="ai.fill(source)">Fill</UButton>
    <UButton v-if="ai.pending.value" variant="soft" @click="ai.cancel()">
      Cancel
    </UButton>
    <UButton variant="soft" @click="ai.undo()">Undo</UButton>
    <UAlert
      v-if="ai.error.value"
      color="error"
      :title="ai.error.value.message"
    />
  </div>
</template>
```

| Argument                     | What it is                                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                     | The form: `useMapoDetail()` in a detail extension, or any object with `model`, `fields` and `annotations`, and optionally `sidebarFields`, `metadata()`, `isNew` (without it the record counts as new), `currentLang`, `languages`, `registry`, `readonly` and `isBusy` (`MapoAiFillTarget`) |
| `options.entity`             | What the AI should know about the record: `label`, `description`, `model` (the permission the gateway asks: `add_` for a new record, `change_` otherwise), `exclude`, `relationChoices` and `evidence`, as in [the body of run](#send-the-record-and-the-source)                             |
| `options.schemaFromMetadata` | Reads the backend's schema from the `OPTIONS` response, as the `MapoDetail` prop of the same name: pass the function the detail has. Default: `metadataToJsonSchema()`; return `undefined` to send the fields alone                                                                          |

It returns:

| Member                | What it is                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill(source, call?)` | Sends the source, a text or its parts, with the operator's `call.instructions` and the `call.provider` to use; resolves once the answer is applied, and never rejects: a failure goes to `error`                                                           |
| `apply(path)`         | Writes a value that waits, by the path of its field                                                                                                                                                                                                        |
| `restore(path)`       | Puts back what the field held before the AI's value went in, when the field still holds that value                                                                                                                                                         |
| `dismiss(path?)`      | Removes the mark of a field, or every mark; the values stay                                                                                                                                                                                                |
| `undo()`              | Puts back every field that still holds the AI's value, as it was before, and removes the marks                                                                                                                                                             |
| `cancel()`            | Stops waiting for the answer; the gateway still finishes the call, which counts against the user's limit                                                                                                                                                   |
| `pending`             | A call waits for its answer                                                                                                                                                                                                                                |
| `error`               | Why the last call got no answer: the gateway's `status` (`0` without one), a `message` for the operator and, when the gateway sends `Retry-After` (429, 503), `retryAfter` in seconds                                                                      |
| `response`            | The last answer of `run`: the outcomes, or the model's refusal (`status: "refused"`)                                                                                                                                                                       |
| `fields`              | Each field of the answer: its `key`, the `path` of its value in the model, the `action` (`apply`, `confirm`, `manual`, `discard`, `empty`), whether it `replaces` a value, whether the form shows it (`shown`), whether it is `applied`, and the `outcome` |

- **Where a value goes.** A translatable field's value goes to `translations.<language>.<key>`, in the language the detail edits once its `OPTIONS` answered, which the request sends as `language`; a part of an object, such as `seo.title`, inside it. A key the form's fields do not declare is never written.
- **The marks** go to the detail's `annotations` channel ([Field annotations](/uikit/form/annotations)), where the form looks for them: at the field. A field with parts, such as an SEO block, gets one mark that tells each part, with one Apply for the parts that wait. The AI's mark replaces the one another component set at the same field, and `dismiss()` and `undo()` remove only the AI's marks; a mark of the `annotations` prop of `MapoDetail` wins over the AI's at the same path.
- **The operator's own changes stay.** `restore()` and `undo()` put a field back only while it holds what the AI wrote: a field the operator changed afterwards keeps the change. A key the AI added goes away again, and so does an object it made on the way (`translations.it`), so the form is as it was. What a field's `onChange` changed stays.
- **A new `fill()`** stops waiting for the previous call. When its answer arrives, the previous answer's marks go; its values stay in the form, and `restore()` and `undo()` then reach only the new answer's. A call that fails or is cancelled leaves the previous answer as it was.
- **A refusal is no error.** When the model refuses, `response` has `status: "refused"` and the model's text in `refusal`; when its answer did not have the shape asked, `result.readable` is `false` and every field is empty. Nothing is written, and `error` stays empty: show them from `response`.
- **Errors.** The call goes through `$mapoFetch`, so a session that ended leads to the login page, and a 403 also shows the "permission denied" message. `error.message` says what happened in the app's language, and how long to wait when the gateway says. An answer cut at its cap (`truncated`), and a prompt the model cannot read whole (`too-long`), have messages of their own, which suggest a shorter text or another model: trying again does not help.
- **A read-only form** is neither asked nor written: a `MapoDetail` with `readonly`, or with a `permissionModel` the user may not add or change. While the detail saves or deletes its record (`isBusy`), nothing is written: an answer that arrives then waits, marked, for Apply.
- **Labels** come from the `mapo.ai.fill.*` and `mapo.ai.errors.*` messages of `@mapomodule/i18n`, in English and Italian, with the shared `mapo.apply` and `mapo.restore`; an app overrides them as any `mapo.*` message.

The reference app has a scenario: `/ai/fill/new` and `/ai/fill/1` in `apps/example-e2e`, with sources for every outcome of the mock, its failures, and the app's rules in `server/plugins/`; `/ai/status` shows what `status` answers the account signed in (`admin`, `editor`, `writer` or `viewer`), and `/ai/keys` how the gateway chooses the key of a call ([Keys](#keys)), with the app's provider `example-keys`, which calls no model and names the key it got. With a local model, `/ai/ollama/new` fills the same article through [Ollama](#ollama), with Mapo's `ollama` or the app's own provider ([Your own provider](#your-own-provider)), and shows what happens while it happens: the steps of the browser and of the server and, through the app's provider, the prompt the gateway composed and the words of the model as they come. `/ai/ollama/blocks/new` does the same on a complex form: every field type, two custom ones registered with `defineFormField()`, a repeater of blocks with nine templates and repeaters inside them, and repeaters the backend describes too, each item shown with what the gateway made of its values. With a key of OpenAI or Anthropic in the dev server's environment, `/ai/cloud/new` and `/ai/cloud/blocks/new` fill the same two forms with [OpenAI](#openai) or [Anthropic](#anthropic), and say what each call took: the time, the tokens, the prompt cache's share, the model that answered and an estimate of the cost. The pages that fill a form also read a file into their source ([Read a file](#read-a-file)): yours, or one of the samples in `public/ai-files/` (Markdown, a web page, CSV, Excel and a calendar event). The app's own reader of calendar events and its `mapo-ai:read` hook, which takes the lines that start with "Internal:" out of every file, are in `server/plugins/mapo-ai-readers.ts`.

## Read a file

`POST /_mapo/ai/read` reads a file the operator gives into the parts of a source: the text `run` takes. The page sends one file; the gateway reads it with the reader of its format and answers its text, which the page shows, and sends to `run` when the operator asks. Reading a file calls no AI, and the gateway keeps nothing of it.

| Format   | Extensions                | Reader     | What `run` gets                                                                                                                                                                                                                                               |
| -------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text     | `.txt`                    | `text`     | The text as the file writes it                                                                                                                                                                                                                                |
| Markdown | `.md`, `.markdown`        | `markdown` | The text, with its marks                                                                                                                                                                                                                                      |
| JSON     | `.json`                   | `json`     | The text as the file writes it, every digit of a number included; a damaged file is `failed`                                                                                                                                                                  |
| HTML     | `.html`, `.htm`, `.xhtml` | `html`     | The text a person reads on the page, in Markdown: headings, paragraphs, lists, quotes, bold and italic, links to the web, an email or a phone, tables. Scripts, styles, the page's title, comments, menus (`nav`), the controls of a form and images stay out |
| CSV      | `.csv`, `.tsv`            | `csv`      | The sheet whole, as a Markdown table, its first row the header                                                                                                                                                                                                |
| Excel    | `.xlsx`                   | `xlsx`     | Each sheet with something in it, whole, as a Markdown table under a heading with the sheet's name                                                                                                                                                             |

- **Which reader.** A file goes to the reader of its name's extension, and only when no reader takes the extension, or the name has none, to the reader of its media type: a `.csv` that Windows declares as `application/vnd.ms-excel` is read as CSV.
- **The text.** A file that is neither UTF-8 nor UTF-16 with its byte order mark is read as Windows-1252, as the spreadsheets and the editors of Western Europe write it; an HTML page in the encoding its `<meta charset>` names. A file with NUL characters, such as a binary one, is no text: it is `failed`.
- **Sheets.** A row goes on a line, its cells between `|`, so the AI reads which column a value is in; rows and columns with nothing in them go. A CSV's delimiter is the one a first line `sep=;` names, or the first of tab, `;`, `|` and `,` that splits the first rows, so a CSV that writes decimals with a comma reads with `;`. A cell of a workbook gives its value, not its format: a date as `2026-03-02`, with its time when it has one, a number with up to 15 significant digits (`25%` is `0.25`), a formula the value the spreadsheet computed. Hidden sheets and rows are read like the others, and every sheet counts toward the length of the text. The old `.xls` is not read. A workbook is `failed` before the reader reads it when its XML unzips into more than 20 MB, counted as it unzips, when a part unzips into more than its ZIP declares, when its sheets hold more than 2 million cells, counting the empty ones up to the last row and column of each, or when it has more than 10,000 parts.
- **Web pages.** The HTML reader is no browser: it applies no CSS, so what a style hides is read, and it cannot tell a page's content from its header and footer, which reach the AI too.
- **Other formats.** Mapo has no reader for PDFs, images or Word documents: such a file is `unsupported`, unless the app registers a reader for it ([Replace or add a reader](#replace-or-add-a-reader)).
- **Whole or not at all.** A file whose text is longer than `limits.maxSourceChars` is `too-long`: a source goes to `run` whole, never cut. The file itself may have up to `limits.maxFileBytes` bytes, 10 MB by default ([Limits](#limits)).

### Send a file

`useMapoAiRead()`, auto-imported in the app's components, sends a file to `read`. Its parts go to `run` as they are, each named after the file:

```ts
const { read } = useMapoAiRead();
const answer = await read(file); // a File, from an <input type="file">
if (answer.status === "read") await ai?.fill(answer.parts); // ai: useMapoAiFill()
```

`read(file, options?)` posts the file with `$mapoFetch`, as the field `file` of a form (`multipart/form-data`), and reads the answer as outside data; `options.name` names a `Blob` that has none, and `options.signal` stops waiting. It rejects with the error of the call (`$fetch`'s, with the HTTP status in `statusCode`), and with a `MapoAiReadAnswerError` (its `name`) for an answer it cannot read. A page that lets the operator edit the text before sending it sends the text instead: `fill(text)`.

### What read answers

| `status`      | What it means                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `read`        | `parts`, the source as `run` takes it, each part named after the file; `reader`, the id of the reader that read it                     |
| `unsupported` | No reader takes the file's format, or the app has turned its reader off                                                                |
| `empty`       | The reader found no text in the file                                                                                                   |
| `too-long`    | The file's text has `chars` characters, more than `run` takes                                                                          |
| `failed`      | The reader could not read the file: damaged, not the format its name says, or locked. The server's log says why, never the file's name |

```json
{
  "status": "read",
  "reader": "csv",
  "parts": [
    {
      "kind": "text",
      "text": "| Title | Status |\n| --- | --- |\n| Ten years of open data | In review |",
      "name": "articles.csv"
    }
  ]
}
```

These are answers, not errors, so a page that reads several files goes on with the others. The errors are the request's: 401 without a session; 403 for a user the app keeps out, or a request from another site; 502 when the backend cannot say who is signed in; 415 for a body that is no form; 413 for a file larger than `limits.maxFileBytes`, or any file when it is `0`; 400 for a form with no file, or more than one. `status` lists the formats the gateway reads (`readers`), from which a page builds the `accept` of its file input, and the largest file (`limits.maxFileBytes`).

### Replace or add a reader

Every way of reading can be replaced by the app. In a Nitro plugin, `registerMapoAiReader()`, auto-imported in the server's code, registers a reader: with the id of one of Mapo's (`text`, `markdown`, `json`, `html`, `csv`, `xlsx`) it takes that reader's place, and with an id of its own it adds a format. The app's readers come before Mapo's, so one that lists an extension of Mapo's reads it.

```ts
// server/plugins/mapo-ai-readers.ts
export default defineNitroPlugin(() => {
  registerMapoAiReader({
    id: "ics",
    label: "Calendar event",
    extensions: ["ics"],
    types: ["text/calendar"],
    read(file) {
      const text = eventText(new TextDecoder().decode(file.bytes)); // the app's own
      return text ? [{ kind: "text", text, name: file.name }] : [];
    },
  });
});
```

| Member       | What it is                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | Lowercase letters, digits and `-`, starting with a letter                                                                                                                                                |
| `label`      | Its name for people, in `status`                                                                                                                                                                         |
| `extensions` | The extensions it reads, without the dot                                                                                                                                                                 |
| `types`      | The media types it reads, for a file whose extension no reader lists, or that has none                                                                                                                   |
| `read(file)` | Reads the file (`name`, `type`, `bytes`) into text parts, `{ kind: "text", text, name? }`, synchronously or not; it throws when it cannot read the file, and returns no part when the file holds no text |

The gateway reads what a reader returns as outside data, as it reads a provider's answer: an entry that is no text part is left out, a text is trimmed and a blank one goes, a part's name is cut to 200 characters, and a reader that throws, or leaves more parts than the 20 `run` takes, makes the file `failed`. Registering an id twice throws, and so does a reader that is none: an id that is not a reader's, no `read()`, or no extension and no media type.

### Touch up what is read

The `mapo-ai:read` hook runs for every file a reader has read, after its reader, Mapo's or the app's: through `context.parts` it changes a part's text, removes parts or adds some. A file no reader takes (`unsupported`) never reaches it.

```ts
// server/plugins/mapo-ai-readers.ts
export default defineNitroPlugin((nitroApp) => {
  // The editors' internal notes stay out of the AI.
  nitroApp.hooks.hook("mapo-ai:read", (context) => {
    for (const part of context.parts) {
      part.text = part.text
        .split("\n")
        .filter((line) => !/^\s*internal:/i.test(line))
        .join("\n");
    }
  });
});
```

The hook runs with:

| Field           | What it holds                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `event`         | The request                                                                                     |
| `user`, `admin` | Who sent the file, as the gateway reads them (`MapoAiUser`), and whether they administer the AI |
| `file`          | Its `name`, `type` and `size` in bytes, never its content                                       |
| `reader`        | The id of the reader that read it                                                               |
| `parts`         | What the reader read, `{ kind: "text", text, name? }`: change a text, remove parts or add some  |

`file` and `user` are read-only. A hook that throws makes the file `failed`; what the hooks leave is read as a reader's, and measured against `limits.maxSourceChars`. The hook sees files only: a text the page sends to `run` itself, such as a pasted one, never goes through it, so it is no boundary for what reaches a provider.

### Turn a format off

`readers` turns a reader off by its id, Mapo's or the app's, without code:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      readers: { xlsx: false },
    },
  },
});
```

A file of a format that is off is `unsupported`, even when its media type names a reader that is on, and `status` does not list the reader. Every reader of Mapo has its place in the runtime config, so the environment turns one off when the server starts: `NUXT_MAPO_AI_READERS_XLSX=false`. A reader of the app's has its place once `readers` names it (`ics: true`). A value that is neither `true` nor `false` turns the reader off, and the build warns about it.

## Providers

`run` calls only the providers `providers` enables, each with the models a request may ask for, its default first, and the seconds a call may take:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      providers: { mock: { models: ["mock"], timeout: 120 } },
      default: { provider: "mock", models: { fill: "mock", extract: "mock" } },
    },
  },
});
```

Without `models` a provider offers its own (`["mock"]` for the mock, two for `openai` and three for `anthropic`; `ollama` and `openai-compatible` have none, so list them); without `timeout` a call may take 120 seconds, 300 with `openai` and `anthropic`, or 600 with `ollama` and `openai-compatible`. `false` turns off a provider a layer enables. `default` names what a request that names nothing gets: without it, or when it names a provider the app does not enable, that is the first provider listed and its first model. With no provider enabled, `run` answers 503.

### The mock

`mock` answers without a network, a key or a cost, for development, tests and demos. It is a provider like any other, so production gets it too when the app enables it, and `status` lists it by its name. It answers a source in the first of three ways that applies:

1. **A failure on command**, written anywhere in the source:

   | Mark                          | The mock                                                  |
   | ----------------------------- | --------------------------------------------------------- |
   | `#mock:refusal`               | Refuses, as a model would                                 |
   | `#mock:invalid-json`          | Writes text that is not JSON: the answer is unreadable    |
   | `#mock:rate-limit`            | Is rate-limited: `run` answers 503 with `Retry-After: 30` |
   | `#mock:unavailable`           | Is down: 502                                              |
   | `#mock:timeout`               | Never answers: 504 once the provider's `timeout` is up    |
   | `#mock:too-long`              | Cannot read the whole prompt: 413                         |
   | `#mock:truncated`             | Writes an answer cut at its cap: 502                      |
   | `#mock:slow`, `#mock:slow=10` | Waits 3 seconds, or the seconds given, then answers       |

2. **A fixture**: an answer written by hand, which the app registers (below), for a source that names it with `#mock:fixture=<name>` or whose text it is, case and spaces aside. A source that names a fixture the app did not register gets a refusal.
3. **Simple rules**: each line `Label: value` whose label is a field's label, key or property name fills that field with the value, quoting the line. A choice is read by its label or its value, a yes or no in English or Italian, a list at its commas and semicolons; the items of a list stay empty. In an extraction, each entity with a field so filled gives one item.

Its answers go through the same checks as a model's. Its failures on command answer whoever writes them: where the app enables the mock in production, anyone who may call `run` can make it refuse, wait or fail.

### Fixtures of the mock

```ts
// server/plugins/mapo-ai-fixtures.ts
export default defineNitroPlugin(() => {
  registerMapoAiMockFixtures([
    {
      name: "about-us",
      answer: {
        values: { title: "About us", summary: "We make chairs." },
        evidence: [{ field: "title", quote: "About us", where: "" }],
      },
    },
    { name: "too-vague", refusal: "The source names no record." },
  ]);
});
```

A fixture has a `name` (lowercase letters, digits, `-` and `_`), an `answer` written as a model writes it, or a `refusal`; optionally the `source` it answers without a mark, and the `usage` to report. The answer names the properties of the answer's schema: the field keys made safe, `seo.title` as `seo_title`. Every value is written as the schema asks: text, `"true"` or `"false"`, a number in digits, `""` for what the source does not give, and a related record by the name to search for, or by its id when `relationChoices` lists the records (`{ record, item }` only where an extraction may link to an item of the same answer). It may hold wrong values or quotes that are not in the source on purpose: they come back discarded or to check. `registerMapoAiMockFixtures()` is auto-imported in the server's code; the reference app registers its own in `apps/example-e2e/server/plugins/mapo-ai-fixtures.ts`.

### OpenAI

`openai` calls OpenAI's models through its [Responses API](https://developers.openai.com/api/reference/resources/responses). Enable it, and give the server the project's key in its environment:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      providers: { openai: {} },
    },
  },
});
```

```bash
# .env in development, the server's environment in production
NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY=<the project's key>
```

- The key goes in the environment only: the options' type has no `apiKey`, and a key written in the Nuxt config is copied into the server bundle, which the module warns about. It is the project's key, the last level of the chain: the AI's admins can assign their own over it ([Keys](#keys)). With no key at any level, `status` says so (`level: "none"`) and, at OpenAI's own address, `run` refuses the provider before calling it (503).
- `models`, without it, is `["gpt-6.1-sol", "gpt-6-luna"]`: GPT-6.1 Sol, the default, and GPT-6 Luna, OpenAI's most efficient. List any model the key may use, one newer than your version of Mapo too. When the server starts, it asks OpenAI for the models the project's key may use, and warns about each one `models` lists that is not among them; without a project's key it checks nothing. In production, list the models: a new version of Mapo may change its defaults.
- `baseURL` is `https://api.openai.com/v1` unless set: `https://eu.api.openai.com/v1` for a project with European data residency, or a proxy that speaks the same API. Only the app sets it, here or with `NUXT_MAPO_AI_PROVIDERS_OPENAI_BASE_URL`. A call to another address goes without a key when none is set, for a proxy that adds its own.
- `timeout` is 300 seconds unless set; `effort` and `promptCache` are below.

Each call:

1. holds the answer to its JSON Schema with OpenAI's structured outputs (`json_schema`, strict). OpenAI shows the schema to the model, so the prompt does not repeat it. The first call with a new schema takes longer, while OpenAI processes it;
2. keeps nothing at OpenAI (`store: false`), and sends no sampling setting;
3. asks the reasoning of `effort`: `"low"` unless set, or `"medium"` or `"high"`. Filling a form from the quotes of a source needs little of it, and the reasoning is paid as written tokens;
4. caps the answer, its reasoning included (`max_output_tokens`), by the size of its schema and the effort. An answer that reaches the cap fails with 502 (`truncated`); one OpenAI's content filter stops comes back as a refusal;
5. streams the answer. A prompt longer than the model reads fails with 413 (`too-long`), a rate limit with 503 and `Retry-After`, and an account without credit with 502, since waiting does not help.

A model that does not take a parameter, as an older one does not take `reasoning` or the cache's options, is asked again without it, once, when OpenAI's refusal says the model does not take it; its calls leave the parameter out for ten minutes, and the server's log says so each time it is left out anew. Without the cache's options, OpenAI caches that model's prompts by its own rules, and the log says that too. Any other refusal fails the call.

### Anthropic

`anthropic` calls Claude through Anthropic's [Messages API](https://platform.claude.com/docs/en/api/messages), in its version 2026-10-21:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      providers: { anthropic: {} },
    },
  },
});
```

```bash
NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY=<the project's key>
```

- The key works as OpenAI's: in the environment only, sent as `x-api-key`, the last level of the chain ([Keys](#keys)); with no key at any level, `run` refuses the provider at Anthropic's own address before calling it (503).
- `models`, without it, is `["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]`: Claude Opus 5.5, the default, Sonnet 5.5 and Haiku 5.5. The check when the server starts works as OpenAI's.
- `baseURL` is `https://api.anthropic.com/v1` unless set, such as a proxy. Anthropic's API runs the model wherever it has capacity, or only in the United States; it has no European region.
- `timeout` is 300 seconds unless set; `effort` works as OpenAI's, `promptCache` is below.

Each call:

1. holds the answer to its schema with Anthropic's structured outputs (`output_config.format`). Claude reads the schema, so the prompt does not repeat it. The first call with a new schema takes longer, while Anthropic compiles it, and Anthropic keeps it compiled for 24 hours. A schema Anthropic cannot compile ("Schema is too complex for compilation"), from a form with many nested fields and lists such as a page of blocks, is asked again without structured outputs: the schema goes at the end of the stable part of the prompt, as for a local model, Claude writes the JSON, and the gateway's sanitizer checks it as it checks every answer. The refusal costs no tokens, only a round trip on the first call; each server process remembers the schema for a day and skips the refusal, and its log says so once. The prompt is longer by the schema, which `promptCache` can keep;
2. asks the reasoning of `effort`, `"low"` unless set. The current models think before they answer, and Opus 5.5 always does; the API version takes no sampling setting;
3. caps the answer, its thinking included (`max_tokens`), by the size of its schema and the effort; an answer that reaches the cap fails with 502 (`truncated`);
4. streams the answer. A prompt longer than the model reads fails with 413 (`too-long`), a rate limit with 503 and `Retry-After`, an overloaded API with 502, and an account without credit with 502;
5. writes each listed value as its schema does. Anthropic's structured outputs do not keep the case of an `enum`'s values, so a value that matches one listed value but for case, such as `Title` for `title`, becomes that value; one that matches none, or several, stays as written, for the gateway's checks.

**Refusals and fallbacks.** Opus 5.5 and Sonnet 5.5 run safety filters, on biology and cybersecurity among other subjects, that can decline a harmless request. The provider asks Anthropic to retry a declined request on the model it picks for that kind of request (`fallbacks: "default"`, a beta of Anthropic's): a model `models` does not list, such as Claude Opus 5, at that model's prices. The answer's `provider.model`, the audit and the server's log name the model that answered. `fallbacks: false` in the provider's entry turns them off, and the AI's admins can turn them off on the AI settings page; they cannot turn them on where the app turns them off. Haiku 5.5 has no fallback, and neither has every kind of request: then the answer is a refusal (`status: "refused"`), which says the kind of request the filters declined.

### The prompt cache

OpenAI and Anthropic keep the start of a prompt in a cache, so a call that begins the same way reads it for a fraction of its price. With `promptCache: true`, the provider marks the end of the prompt's stable part (Mapo's rules, the app's, the record's description and, with it, the answer's schema) and never the source:

```ts
providers: {
  anthropic: { promptCache: true },
}
```

The first call writes the stable part to the cache, at 1.25 times the price of its tokens; the calls on the same kind of record that follow within the cache's time, 5 minutes for Anthropic and 30 for OpenAI, read it at a tenth of the price or less. It pays from the second call on the same kind of record: an operator who fills several records in a row. A call alone pays a quarter more on the stable part. Off, the default, nothing is written to a cache, not even what OpenAI would write by itself, unless a model refuses the cache's options (above): then OpenAI caches that model's prompts by its own rules, and the server's log says so. `usage.cacheReadTokens` and `usage.cacheWriteTokens` say what a call read and wrote. A provider caches a stable part only from a minimum size, 512 tokens for Anthropic's current models and 1024 for OpenAI's: a small form may not be cached at all.

The environment changes these options when the server starts, as any other: `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_PROMPT_CACHE=true`, `NUXT_MAPO_AI_PROVIDERS_OPENAI_EFFORT=medium`.

### Ollama

`ollama` calls a model served by [Ollama](https://ollama.com) 0.40.13 or later, on the app's server or in its network, through Ollama's own API:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      providers: {
        ollama: { models: ["gemma4:12b", "qwen3.8:27b"] },
      },
    },
  },
});
```

- `models` lists the models a request may ask for, the default first. Ollama may have more installed: only these are called. When the server starts, it asks Ollama for its models, and warns about each one `models` lists that Ollama does not have, or that Ollama cannot be reached.
- `baseURL` is Ollama's address: `http://localhost:11434` unless set. Only the app sets it, here or with `NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL`; a request never names a server.
- When Ollama sits behind a proxy that asks for a token, set the token in the server's environment as `NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`: the provider sends it as a bearer token. The options' type has no `apiKey`, on purpose: a key written in the Nuxt config anyway is used, but the build copies it into the server bundle, and the module warns about it. A key of digits only reaches the server as a number, which is not a key: the server's log says so.
- `timeout` is 600 seconds unless set: a large form keeps a model on the app's own hardware busy for minutes.
- The provider calls only Ollama 0.40.13 or later, the version it was verified with: it asks Ollama its version, every ten minutes, and refuses an older one (502), since an older Ollama may ignore what keeps it from cutting a prompt. A key sent over plain `http:` to another machine travels in clear, and the server's log says so.

Each call:

1. puts the answer's JSON Schema in the prompt, after the rules. Ollama holds the answer to the schema, but does not show it to the model, which would never read what each field holds, its limits, or the templates of a list's items;
2. turns the model's reasoning off (`think: false`) and asks for the same answer each time (`temperature: 0`);
3. asks a context large enough for the prompt and the answer, within what the model reads, which Ollama says for each model. By default Ollama cuts a prompt longer than the context, and drops the start of the prompt when the context fills up, without an error: the rules at the top go first. The provider tells Ollama to refuse instead, so a prompt that does not fit fails with 413 (`too-long`), with the count of its tokens in the server's log. A prompt Ollama counted well below its size, which only an Ollama that cut it would count, fails the same way;
4. caps the answer by the size of its schema, more for an extraction: every value of the schema is a string, and a model can loop inside one. An answer that reaches the cap, or the end of the context, fails with 502 (`truncated`);
5. streams the answer from Ollama, so the time the model takes to write it is limited only by `timeout`; the gateway answers the page once, with the whole answer. Loading the model and reading the prompt must take less than five minutes: Ollama sends its first bytes only with the first words of the answer, and Node's `fetch` waits five minutes for them. Past that, the call fails with 504.

### OpenAI-compatible servers

`openai-compatible` calls a model served by a server that speaks OpenAI's Chat Completions API, such as LM Studio, vLLM or the server of llama.cpp:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      providers: {
        "openai-compatible": {
          baseURL: "http://gpu.internal:1234/v1",
          models: ["qwen3-32b"],
          contextTokens: 32768,
        },
      },
    },
  },
});
```

- `baseURL` is required: the address the server answers `/chat/completions` and `/models` under, usually ending in `/v1`. Without it the provider is not enabled. The environment can change it with `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_BASE_URL`, and set a key with `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY`, sent as a bearer token.
- `models` and `timeout` work as for Ollama, and so does the check of the models when the server starts.
- Each call puts the answer's schema in the prompt and in `response_format`, caps the answer (`max_tokens`) and streams it. It does not turn a model's reasoning off: no parameter does so on every server, and one a server does not know can fail the call. Turn it off on the server for a model that reasons, or its reasoning takes time and tokens of the cap.
- Such a server sets the context of its models itself. vLLM refuses a prompt and a cap that do not fit together, and says how many tokens the prompt has: the provider asks once more with the cap that fits, when an answer still has room, and fails with 413 otherwise; llama.cpp refuses a prompt that does not fit, also a 413. Others cut the prompt in silence, rules included. `contextTokens` says how many tokens the server's models read, when its list of models does not (vLLM's does): then the cap leaves room for the prompt, a prompt that cannot fit fails before the call, and one the server counted up to the context fails after it, as a prompt too long even when the answer then ran out of room. Without a context, a prompt cut a little can go through. For Ollama, use `ollama`, which refuses instead of cutting.
- A stream that ends before the model says why it stopped, as when a server or a proxy drops the connection, and an error the server sends in the stream, as llama.cpp does, fail with 502. The provider does not follow a redirect: it would send the prompt to an address the app did not write.

### Behind a proxy

A call can take minutes, to a local model or for a long extraction, and the page waits for the whole answer. A proxy in front of the app's server may close the request first: nginx does after 60 seconds by default. Give `/_mapo/ai/run` a read timeout at least as long as the provider's `timeout`. The same holds for a proxy between the app's server and the model's: Mapo's providers stream, but a server sends its first bytes only once it has read the prompt.

### Your own provider

An app adds a provider in a Nitro plugin with `registerMapoAiProvider()`, and enables it in `providers`, with its models:

```ts
// server/plugins/mapo-ai-provider.ts
export default defineNitroPlugin(() => {
  registerMapoAiProvider({
    id: "acme",
    label: "Acme",
    capabilities: {
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    async run(request) {
      const response = await fetch("https://llm.example.com/v1/answer", {
        method: "POST",
        signal: request.signal,
        body: JSON.stringify({
          model: request.model,
          system: request.prompt.instructions,
          input: request.prompt.input,
          schema: request.schema,
        }),
      });
      if (response.status === 429) {
        throw new MapoAiProviderError("rate-limit", "Acme is busy", {
          retryAfter: 60,
        });
      }
      if (!response.ok) {
        throw new MapoAiProviderError(
          "unavailable",
          `Acme answered ${response.status}`,
        );
      }
      const body = await response.json();
      return {
        status: "answered",
        output: body.output,
        usage: { inputTokens: body.tokensIn, outputTokens: body.tokensOut },
      };
    },
  });
});
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: { ai: { providers: { acme: { models: ["acme-large"] } } } },
});
```

- `run(request)` gets the `task`, the `model`, the `prompt` (`instructions`, the part that stays the same, and `input`, the operator's instructions and the source), the source's `parts`, the JSON Schema of the answer (`schema`, in the subset every provider accepts in strict mode), the `contract` it was compiled from, and a `signal`, aborted when the `timeout` is up. The gateway stops waiting then, whatever the provider does. The contract and the parts are copies: changing them changes nothing the answer is read against.
- It returns `{ status: "answered", output, usage }`, where `output` is the answer parsed from JSON (or the model's text, when it is not JSON: the answer then comes back with `readable: false`), or `{ status: "refused", refusal, usage }`. `usage` may add `cacheReadTokens` and `cacheWriteTokens`, the prompt's tokens read from and written to the provider's cache, and the answer may add `model`, the model that answered when it is not the one asked: the gateway's answer and its audit name it. The gateway reads what it returns as outside data: `output` as plain JSON, so one it cannot copy as JSON is unreadable, token counts as whole numbers from zero, a `model` only as a name of up to 200 characters, and anything else is a 502.
- `key`, optional, says that the provider calls its server with a key: `"required"`, or `"optional"` for a server that also takes calls without one. Each call then gets the key the chain chose for the user as `request.apiKey` ([Keys](#keys)): the user's own token where allowed, an admin's key, or the project's, from `NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY` (`NUXT_MAPO_AI_PROVIDERS_ACME_API_KEY`). A `"required"` provider without a key is refused before the call. Without `key`, the provider gets no key from the gateway and keeps its own, and the admins assign it models only. Never log `apiKey`.
- `capabilities` say what the provider can do. The gateway reads none of them: it sends text only, waits for the whole answer and calls no tools.
- `listModels(signal, apiKey)`, optional, returns the models its server has (`MapoAiModelInfo[]`). The server calls it when it starts, with the project's key, and warns about each model `providers` allows that the list does not have, or that the list could not be read; a request may still ask only for the models `providers` lists. The connection check of the [AI settings](#ai-settings) calls it too, with the key the chain chose for the user.
- A `MapoAiProviderError` tells the gateway what failed: `timeout` (504), `rate-limit` (503, with `Retry-After` when `retryAfter` is a count of seconds, at most an hour), `too-long` for a prompt the model cannot read whole (413), `unavailable`, `invalid-response`, `refused-request` or `truncated` for an answer cut at its cap (502). Any other error, or a failure the gateway does not know, is a 502 too. The message goes to the server's log, never to the browser.
- An id is lowercase letters, digits and `-`, starting with a letter. `mock`, `openai`, `anthropic`, `openai-compatible` and `ollama` are kept for Mapo's own providers: registering one of them is an error.
- A registered provider that `providers` does not enable is never called, and the server says so when it starts; so it does for one `providers` enables that does not exist or has no model.

`registerMapoAiProvider()` and `MapoAiProviderError` are auto-imported in the server's code; the types are `MapoAiProvider`, `MapoAiProviderRequest`, `MapoAiProviderAnswer` and `MapoAiModelInfo`, in `mapomodule/types`.

The reference app registers one: `apps/example-e2e/server/plugins/mapo-ai-ollama.ts` calls a local Ollama through its native API, streamed, with a cap on the tokens of the answer, since a local model can loop inside a string value; the cap and the context grow with the answer's schema, so a large form is not cut. Unlike Mapo's `ollama`, it traces each step for the app's AI lab. It is off unless the dev server starts with `EXAMPLE_OLLAMA_MODELS`, the models to offer (`gemma4:12b,qwen3.8:27b`), which its `nuxt.config.ts` enables in `providers` for it and for Mapo's `ollama`, so the lab compares the two.

## Keys

A provider that calls its server with a key gets, for each call, the key nearest the user, on three levels: the user's own token, where an admin allows one; a key the AI's admins assign; the project's key, in the server's environment. The browser never sees a key: `status` says which level gives it, and its last four characters.

### Which key a call uses

For each provider, the admins' assignments that apply to the user come nearest first: the one for the user, then those of their groups, in the order of priority the admins set, then the one for everyone.

- **The models.** The nearest assignment says which of the models `providers` enables the user may call; an assignment that allows none closes the provider to them. Without an assignment for the provider, the user gets every model `providers` enables. An assignment never opens a provider or a model `providers` does not enable.
- **Personal tokens.** The nearest assignment says whether the user may use their own token. Without an assignment, they may not.
- **The key.** The user's own token, where allowed and saved; else the first key the assignments hold, nearest first; else the project's key, from the environment (`NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`).

So an admin can give the editors a key of their own and a cheaper model, keep the project's key for everyone else, and let one user bring their own token. A user in several groups gets the assignment of the group the admins put higher ([Assign keys](#assign-keys)).

For each provider that calls with a key, `status` adds `key`:

```json
{
  "id": "openai",
  "label": "OpenAI",
  "models": ["gpt-6-luna"],
  "key": {
    "level": "group",
    "group": "editors",
    "last4": "a1b2",
    "required": true,
    "personal": { "allowed": true, "saved": false }
  }
}
```

- `level` is where the key comes from: `personal`, `user`, `group` (with the `group`), `all`, `project`, or `none` when no level has one.
- `last4` is the key's last four characters, for a key of 16 characters or more.
- `required` says whether the provider needs a key. With `none`, `run` refuses it before calling it (503), and `default` names a provider that can be called when there is one. A server on the app's own network takes calls without a key: `ollama` and `openai-compatible` are not `required`, and the token of a proxy in front of them is their project's key.
- `personal` says whether the user may use their own token, whether they saved one, and its last four characters. A saved token is used only while an assignment allows it.

A provider that uses no key, as the mock, has no `key`: an assignment gives it models only.

Without an open storage, as in production without `NUXT_MAPO_AI_SECRET`, there are no assignments and no tokens: `status` shows the project's keys, and `run` answers 503 all the same, since a call that cannot be audited is not made. When the admins' keys are stored but cannot be read, sealed with another secret or by a newer version of Mapo, the gateway does not go on with less than the admins decided: `status`, `run` and the routes of the keys answer 503, and the server's log says why, until the secret is the one that sealed them or the record is removed from the storage (`keys/assignments.sealed` in the `mapo-ai` mount).

### Assign keys

The AI's admins ([Admins](#admins)) assign keys through these routes:

| Route                       | What it does                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /_mapo/ai/keys`        | The providers `providers` enables, the assignments, the order of the groups and the tokens the users saved, never a key |
| `PUT /_mapo/ai/keys`        | Saves an assignment, which replaces the one of the same scope and provider, and answers it without its key              |
| `PUT /_mapo/ai/keys/groups` | The order of the groups, highest priority first: `{ "groups": ["editors", "reporters"] }`                               |
| `DELETE /_mapo/ai/keys/:id` | Removes an assignment, its key with it: its users fall back on the next level. 204, or 404 for an id that has none      |

```ts
import type { MapoAiKeyAssignment } from "mapomodule/types";

const assignment = await $fetch<MapoAiKeyAssignment>("/_mapo/ai/keys", {
  method: "PUT",
  body: {
    scope: { kind: "group", group: "editors" },
    provider: "openai",
    models: ["gpt-6-luna"],
    key: editorsKey,
    personalTokens: true,
  },
});
// assignment.key is { last4: "…" }: the key never comes back.
```

- `scope` is `{ "kind": "all" }`, `{ "kind": "group", "group": "editors" }`, with the group's name as `userInfoApi` sends it, or `{ "kind": "user", "user": "42", "label": "ada" }`, with the backend's `id` as text and an optional `label` (up to 150 characters) that only shows the user by name in the [AI settings](#ai-settings): the `id` alone decides.
- `models` names models `providers` enables for the provider, kept in the app's order; `[]` closes the provider to the scope, and `null` opens every model again. A new assignment without `models` opens every model, and it is nearer to its users than their groups' assignments: to give a user a key of their own and keep their group's models, repeat the models.
- `key` is printable characters without spaces, up to 4096; `null` removes it, and the next level's key applies. An assignment without a key narrows the models and keeps the key of the next level.
- `personalTokens` lets the users of the scope use their own token; a new assignment has it `false`.
- On a replacement, what the body leaves out stays as it was, the key included.
- A provider that uses no key takes no `key` and no `personalTokens`. A provider or a model `providers` does not enable is a 400, whose message names the field, never the key. There are 500 assignments at most (409 past them) and 500 groups in the order.

The groups the order leaves out come after those it names, by name. The assignments and the order are one sealed record: two admins saving at once on one server both keep their change, and a read waits for a save in progress; with several server processes, the last write wins. Each change goes to the [audit](#the-audit), never with its key.

### Personal tokens

A user brings their own token where an admin's assignment allows it. They are off by default, since a call with a personal token sends the record and its source through an account the company does not control.

| Route                                    | What it does                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PUT /_mapo/ai/token`                    | `{ "provider": "openai", "token": "…" }` saves the user's token, replacing theirs: 204, or 403 where no assignment allows it |
| `DELETE /_mapo/ai/token?provider=openai` | Removes the user's token: 204, whether there was one or not. An AI admin removes another user's with `&user=<id>`            |

The token is sealed in the user's own space of the storage, so it follows them on every device. It is used only while the nearest assignment allows it: when an admin turns personal tokens off, the next call uses the next level's key, and the token stays until its user or an admin removes it. `GET /_mapo/ai/keys` lists the saved tokens to the admins, with whose and the last four characters.

## AI settings

The module adds a page, **AI settings**, at `/ai-settings`, in the sidebar's footer, for every signed-in user; a user the app keeps out of the AI is told so there. It adds it only when the app has no page on that path, as Mapo does with `/login`. The demo app `apps/example-ai` shows it in a project that enables only the AI, beside a page of the app's own that reads `status`.

- **Each user** picks the provider and model they prefer, among those they are given ([Which key a call uses](#which-key-a-call-uses)): it becomes their default for `run`, while the app and the admins give it to them and a key reaches the provider; when it does not apply, the page says so. They see which key their calls use, save or remove their own token where an admin's assignment allows one ([Personal tokens](#personal-tokens)), and check the connection.
- **The AI's admins** also see the keys: the assignments to everyone, a group or a user, which they add, change and remove; the order of the groups; and the tokens the users saved, which they can remove ([Assign keys](#assign-keys)), and change [how the AI works](#how-the-ai-works) in the whole app. Assigning a key to one user with every model, while a group of theirs narrows the models, shows a warning and offers the group's models.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      settings: {
        label: "Impostazioni AI",
        usersApi: "/api/users/",
        groupsApi: "/api/groups/",
      },
    },
  },
});
```

- `path` moves the page, and `false` leaves it out: then the app puts the component in a page of its own, with its own `definePageMeta`:

  ```vue
  <!-- app/pages/settings/ai.vue -->
  <template>
    <MapoAiSettings />
  </template>
  ```

- `label` is the page's entry in the sidebar, "AI settings" unless set. The sidebar shows it as written, since it translates no route's label: an app in another language sets it (`label: "Impostazioni AI"`). The page's own texts come from the `mapo.ai.settings.*` messages, in English and Italian.
- `usersApi` and `groupsApi` are the backend's endpoints that list users and groups as Django REST Framework does, plain or paginated (`results`). An admin assigning a key searches them with `?search=`, with their own session: a user is saved by their `id`, shown by `username`, `email` or name; a group by its `name`, as `userInfoApi` lists a user's groups. Without them, the admin writes a user's id or a group's name. The environment can change them (`NUXT_PUBLIC_MAPO_AI_SETTINGS_USERS_API`).

The page calls these routes besides `status`, `keys` and `token`:

| Route                          | What it does                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /_mapo/ai/preferences`    | `{ "provider": "openai", "model": "gpt-6-luna" }` saves the user's preference, sealed in their space of the storage: 204, or 403 for a provider or model they are not given |
| `DELETE /_mapo/ai/preferences` | Removes it: the app's default applies again. 204                                                                                                                            |
| `POST /_mapo/ai/test`          | `{ "provider": "openai", "model": "gpt-6-luna" }` checks the connection, as below                                                                                           |

`status` answers the saved preference as `preference`, even when it no longer applies, as when an admin closed the model to the user; `default` says what applies.

**Check the connection** (`POST /_mapo/ai/test`) asks the provider's server for its list of models, with the key the user's calls use, which costs no tokens. The answer, `MapoAiTestResponse`, has an `outcome`:

- `connected`: the server answered and lists the model, with the time it took (`latencyMs`);
- `model-missing`: the server answered without the model;
- `no-key`: the provider needs a key and no level gives the user one;
- `unverifiable`: the provider cannot list its models, as the mock;
- `failed`: the server did not answer, or refused the key; `failure` says how (`timeout`, `rate-limit`, `unavailable`, `refused-request`, `invalid-response`), and the server's log why.

Without a model, the check looks for the user's default model of the provider. A user may check ten times a minute (429 past that); a body that is not a check is a 400, and a provider or a model they are not given a 403. An app's provider is checked through its `listModels(signal, apiKey)`, which gets the key the chain chose for the user ([Your own provider](#your-own-provider)).

### How the AI works

The AI's admins also see **How the AI works**, below the keys, for the whole app. The app's options stay the defaults: the admins change instructions, rules, words and the cache; what widens the models or the spending only where the app allows it. Each block saves on its own, and every change is audited.

- **Instructions**, for every task (`all`), to fill a record and to extract records: layer 3 of [the prompt](#the-prompt), after Mapo's rules and the app's, which win where they disagree. The page shows the rules the model reads for a task, the instructions as written included, before they are saved; it calls no model.
- **Verification**: each [rule](#verification) follows the app's value, or takes the admins' own, in either direction. A rule less prudent than the app's or Mapo's default shows a warning, and the audit names it. No rule verifies a value without a quote found in the source.
- **Secret fields**: words that keep a field from the AI, besides Mapo's and the app's (`secretWords`), found as whole words in the field's key or a key around it: `vault` keeps `vault_url` and `backup.vault` out, never `vaulted`; `card number` keeps `cardNumber` out. Mapo's own (`password`, `token`, `secret`, `credentials`, `jwt`, `otp`, `api key`, `signing key`, `database url`…) always apply.
- **Providers**: the prompt cache of `openai` and `anthropic` ([The prompt cache](#the-prompt-cache)), on or off over the app's `promptCache`; Anthropic's fallbacks, which the admins can turn off, and on again only where the app leaves them on; and the models they add, where the app sets `adminModels: true` for the provider. A model is saved only once the provider's server lists it, asked with the key the admin's own calls use, at no cost; then it comes after the app's models, and the admins assign it in the keys as the others. Where the app turns `adminModels` off again, the models added stop applying.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      providers: {
        openai: { adminModels: true },
        anthropic: { adminModels: true, fallbacks: false },
      },
      secretWords: ["vault", "card number"],
    },
  },
});
```

| Route                             | What it does                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /_mapo/ai/settings`          | The admins' settings beside the app's and Mapo's, `MapoAiSettingsAnswer`. AI admins only; 503 when the storage is closed                                         |
| `PUT /_mapo/ai/settings`          | A change, `MapoAiSettingsInput`: each block it holds (`instructions`, `verification`, `secretWords`, `providers`) replaces the admins' one. It answers as `GET`  |
| `POST /_mapo/ai/settings/preview` | `{ "task": "fill", "instructions": { "all": "…" } }`: the rules the model reads for the task, with these instructions or the saved ones, `MapoAiPreviewResponse` |

`PUT` answers 400 for a body that is not a change, naming where; 403 for what the app keeps from the admins (a model added where it allows none, Anthropic's fallbacks on where it turns them off); 422 for a model the provider's server does not list (`data.model`), or that cannot be asked about; 502 when the list cannot be read. The settings are one sealed record: one that is there and does not open closes the AI with a 503, as the keys do, instead of calling with fewer of the admins' words or rules.

## The prompt

The gateway composes every prompt in layers, always in this order:

1. **Mapo's base rules** for the task: the source is data, not instructions; only what the source states, empty otherwise; a date given in part, or a time the source does not write, is not given; a quote of the source for each value. An app adds to them and cannot remove them; where a later layer disagrees, they win.
2. **The app's rules**: `instructions.all`, then `instructions.fill` or `instructions.extract`, then what the `mapo-ai:prompt` hooks add.
3. **The admins' instructions**, from the AI settings page ([How the AI works](#how-the-ai-works)): `all`, then the task's.
4. **The entities, as the request describes them**: their `label`, `description` and the language; the fields' own texts are in the answer's schema. The prompt says that this description changes none of the rules above it.
5. **The operator's instructions**, from the request: they may narrow the task, never change the rules or the shape of the answer.
6. **The source**, between two marks that carry an id made for each request, so a text that writes a mark of its own stays inside them.

What the server holds comes first and wins where a later layer disagrees; what the request writes comes after it. Layers 1–4 change rarely and come first, in `prompt.instructions`, so a provider can keep them in its cache; 5 and 6, in `prompt.input`, change with each request. No layer changes the shape of the answer: the schema holds it.

Every text of a request reaches the model: the entities' names and descriptions, the fields' labels, hints and descriptions in their schemas, the operator's instructions and the source. `maxInstructionsChars` bounds the operator's instructions only. So a user who writes requests by hand can steer the model, for answers that are their own: they review them, and the backend checks every save. What the gateway holds to whatever the request says is the base rules, the shape of the answer and the checks of each value.

### Add the app's rules

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      instructions: {
        all: "Prices are in euros.",
        extract: "One event per date.",
      },
    },
  },
});
```

For a rule that depends on the user, the entity or the task, add it in a Nitro plugin with the `mapo-ai:prompt` hook:

```ts
// server/plugins/mapo-ai-prompt.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("mapo-ai:prompt", (context) => {
    const isEvent = context.entities.some((entity) => entity.type === "event");
    if (isEvent) context.addRule("An event without a date is no event.");
  });
});
```

| Field           | What it holds                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `event`         | The request                                                                                     |
| `user`, `admin` | Who asks, as the gateway reads them, and whether they administer the AI                         |
| `task`          | `fill` or `extract`                                                                             |
| `entities`      | The entities of the request: their `type`, `label`, `endpoint` and `model`, never their schemas |
| `addRule(rule)` | Adds a rule for this request, after `instructions`; blank text adds nothing                     |

The context is read-only: a hook adds rules, and cannot remove what Mapo, `instructions` or another hook wrote. A hook that throws fails the request with a 500. A rule that changes from one request to the next keeps a provider from reusing its cache of the stable layers.

## Verification

A filled value is verified when a quote the AI gives is found in the source, as whole words, and holds the value: its text, its number (by default the only number the quote writes) or its choice's label; a date its day and year, a time its hours and minutes. The app can change the rules, and the AI's admins can change the app's on the AI settings page ([How the AI works](#how-the-ai-works)), never so far that a value is verified without a quote found in the source:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: { ai: { verification: { bareHours: true } } },
});
```

| Rule            | Default    | What it says                                                                     |
| --------------- | ---------- | -------------------------------------------------------------------------------- |
| `dateYear`      | `true`     | The quote of a date writes its year: `14 ottobre` verifies no date               |
| `bareHours`     | `false`    | An hour alone (`alle 21`) counts as a time, from 13 to 23                        |
| `timeZones`     | `true`     | A date and time verifies only with the time zone of its quote                    |
| `oneWordQuotes` | `"unique"` | A quote of one word counts when the source writes it once; with `"never"`, never |
| `richTextLinks` | `true`     | Rich text verifies only when its quote writes the address of each of its links   |
| `soleNumber`    | `true`     | A number verifies only when its quote writes no other number, a date included    |

With `soleNumber`, anything in a number's quote that reads as another number keeps it to check: `6 stars out of 5` verifies neither 6 nor 5, and so does a date, a time, a range (`5-10`) or a number that could be two (`1.500`, 1500 or 1.5). The same number written twice, or in two unambiguous ways (`1'200` and `1200`), verifies. The values of a list quoted together (`Seats: 120, 80`) verify only with a quote each.

A field's pattern runs on the server only when a bound on its work, for the value's length, stays small. A pattern that can backtrack for minutes, such as `^(a+)+$`, a long counted repeat on a long value, such as `a{5000}`, one JavaScript cannot read and one whose matcher fails while it runs are not applied: the value is kept and never verified, and a warning (`unchecked-pattern`, `unreadable-pattern`) says so. The backend still checks every value it saves.

## Limits

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    ai: {
      limits: {
        perUserPerMinute: 20,
        maxSourceChars: 100000,
        maxInstructionsChars: 2000,
        maxFileBytes: 10485760,
      },
    },
  },
});
```

- `perUserPerMinute`: the calls to `run` one user may make in the last sixty seconds; `0` takes none. `read` calls no AI, and has no limit of calls. The count lives in the memory of the server process: a restart forgets it, and each process of a server with several counts for itself. A request the gateway refuses before calling the provider does not count; one past the limit gets a 429 with `Retry-After`.
- `maxSourceChars`: the characters of the source, all its parts together, counted as JavaScript counts a string's `length`; `0` lets through only an empty source. `read` reads no file into more: a longer one is `too-long`.
- `maxInstructionsChars`: the characters of the operator's instructions; `0` lets operators send none.
- `maxFileBytes`: the bytes of a file `read` takes, 10 MB (10485760) by default; `0` takes none.

Past either length of `run` the request gets a 413. Besides the source and the instructions, a body of `run` may have 2 MB for the entities' descriptions. A larger one gets a 413 too: at once when its `Content-Length` says so, otherwise as soon as what has arrived passes the bound, before the rest is read. A request of `read` is bounded the same way: its body may have `maxFileBytes` bytes and 16 KB more for the form's own headers, and a file larger than `maxFileBytes` gets a 413, as does any file when it is `0`.

## The audit

Every call that reaches a provider leaves a record in the storage, written as soon as the provider answers, before its answer is read: who made it and when, the task, the entities (`type`, `label`, `endpoint`, `model`), the provider and the model that answered, for a provider that calls with a key the level that gave it (`key`, never the key), the version of the prompt, the tokens (those of the provider's [prompt cache](#the-prompt-cache) among them), the outcome (`answered`, `refused`, or `failed` with why) and how long it took. A call that failed after the provider started answering, as an answer cut at its cap, keeps the tokens the provider says it used: it is paid. Never the source, the instructions, the values or the text of a refusal. Records are sealed like the rest of the state, filed in the space of their user, and expire after `audit.retentionDays` days, 90 by default.

A request refused before the provider leaves no record. Without an open storage, `run` answers 503 and calls nothing: a call that cannot be audited is not made. When writing a record fails after the call, the server's log says so, and the answer still reaches the user.

Every change of the keys leaves a record too, under `actions:` in the audit's own space: an admin's assignment saved (and whether its key changed) or removed, the order of the groups, a user's own token saved or removed, with who did it and for whom. Never a key. So does every change of the admins' settings (`settings-saved`): who, which blocks and providers, and which rules of verification it made less prudent than the app's or Mapo's defaults, never the instructions or the words. No route reads the audit.

## The secret and the storage

The gateway keeps its state on your app's server, in the Nitro storage mount `mapo-ai`. Every record is encrypted (AES-256-GCM) before it reaches the storage driver, with a key derived from a secret you set, so the files or keys of the storage hold no readable value and no user id; only the records' names (such as the day and time of an audit record) and their expiry stay in clear. `run` writes its audit there ([The audit](#the-audit)), and the server checks the secret and the mount when it starts.

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

Setting `mapo.ai` (or `mapoAi`) installs the module and turns the gateway on. Its options:

| Option         | Type                                                                                                           | Default                                | Description                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `admin`        | `{ groups?: string[]; permissions?: string[] }`                                                                | `{}`: superusers only                  | Who administers the AI ([Admins](#admins))                                               |
| `users`        | `{ groups?: string[]; permissions?: string[] }`                                                                | Not set: every signed-in user          | Who may use the AI ([Restrict who uses the AI](#restrict-who-uses-the-ai))               |
| `providers`    | `Record<string, MapoAiProviderOptions \| false>`                                                               | `{}`: no provider, `run` answers 503   | The providers `run` may call, and their options ([Providers](#providers))                |
| `default`      | `{ provider?: string; models?: { fill?: string; extract?: string } }`                                          | The first provider and its first model | What a request that names no provider or model gets                                      |
| `instructions` | `{ all?: string; fill?: string; extract?: string }`                                                            | `{}`                                   | The app's rules in every prompt ([The prompt](#the-prompt))                              |
| `secretWords`  | `string[]`                                                                                                     | `[]`                                   | Words that name a secret field ([How the AI works](#how-the-ai-works))                   |
| `verification` | `{ dateYear?, bareHours?, timeZones?, oneWordQuotes?, richTextLinks?, soleNumber? }`                           | The prudent defaults                   | What a quote must hold for a value to be verified ([Verification](#verification))        |
| `readers`      | `Record<string, boolean>`                                                                                      | `{}`: every reader on                  | The readers of `read` turned off, or on, by id ([Turn a format off](#turn-a-format-off)) |
| `limits`       | `{ perUserPerMinute?: number; maxSourceChars?: number; maxInstructionsChars?: number; maxFileBytes?: number }` | `20`, `100000`, `2000`, `10485760`     | The limits of `run` and `read` ([Limits](#limits))                                       |
| `audit`        | `{ retentionDays?: number }`                                                                                   | `{ retentionDays: 90 }`                | How long an audit record is kept ([The audit](#the-audit))                               |
| `settings`     | `{ path?: string \| false; label?: string; usersApi?: string; groupsApi?: string }`                            | `/ai-settings`, "AI settings"          | The AI settings page ([AI settings](#ai-settings))                                       |

An entry of `providers` (`MapoAiProviderOptions`) takes `models` and `timeout`, at most 3600 seconds; `openai`, `anthropic`, `ollama` and `openai-compatible` also take `baseURL`; `openai` and `anthropic` take `effort` (`"low"`, `"medium"` or `"high"`, `"low"` by default) and `promptCache` (`false` by default); every provider but the mock takes `adminModels` (`false` by default), which lets the AI's admins add models ([How the AI works](#how-the-ai-works)); `anthropic` takes `fallbacks` (`true` by default); `openai-compatible` takes `contextTokens`, a whole number of tokens from 1024 to 10,000,000 ([Providers](#providers)).

The module reads every option when the app builds, and warns about what it cannot read. A value it cannot read never widens what the AI may do: a `users` that names no group or permission it can read lets in only superusers and the AI's admins, a provider it cannot read is not enabled, a reader whose value it cannot read is off, and a limit it cannot read is `0`, the narrowest. A rule of verification, or the audit's retention, that it cannot read keeps its default. The options reach the server in its private runtime config, never in the public one, complete with their defaults, so the environment can change one when the server starts, with Nuxt's variables: `NUXT_MAPO_AI_LIMITS_PER_USER_PER_MINUTE=50`. An option with no default that the config does not set, such as `default.provider`, is not in the runtime config, so no variable reaches it. The server reads the options again with the same rules, and logs once a value it cannot read. Nuxt merges the options as any configuration: across layers, and `mapoAi` with `mapo.ai`, lists add up instead of replacing each other, so a layer's `groups` and the app's are all kept.

The secret is not an option: it is the environment variable `NUXT_MAPO_AI_SECRET`, read when the server starts. The providers' project keys go in the environment too: `NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY`, and `NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY` for an app's provider that declares `key`. The keys the AI's admins assign, and the users' own tokens, are kept sealed in the storage ([Keys](#keys)).

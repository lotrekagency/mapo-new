# @mapomodule/ai

AI-assisted data entry for Mapo backoffices. Its purpose: an operator hands Mapo a source, such as a text, a document or a spreadsheet, a language model proposes the values of a form, and the operator reviews them before anything is saved.

::: warning Experimental
The package is at its first building blocks. Today it installs the **AI gateway** on your app's server, with an encrypted storage for the gateway's state. The gateway tells a signed-in user what it offers them (`status`), and asks a provider to fill a record or to extract the records of a source (`run`), answering what the AI proposes, checked field by field. The only provider Mapo ships is `mock`, which answers without a network; an app can register its own. No form fills itself yet: a page calls `run` and decides what to do with its answer. Routes, responses and options can change in any release while the package is experimental.
:::

## What works today

- The module installs only when the app asks for it: an app without the `mapo.ai` key loads nothing of it.
- The gateway knows the user from the backend session: it forwards the request's cookie to `userInfoApi`, as Mapo does when it renders a page. Without a session it answers 401.
- `GET /_mapo/ai/status` tells a signed-in user the version of the gateway's contract, whether the app lets them use the AI and whether they administer it, and the providers, models and limits they get; an admin also gets the state of the storage.
- Two options say who administers the AI and who may use it, `admin` and `users`, and a Nitro plugin can narrow it further with the `mapo-ai:user` hook.
- `POST /_mapo/ai/run` fills one record (`fill`) or extracts every record a source describes (`extract`). The page sends the record's two descriptions, its backend schema and its form's fields, and the source; the gateway builds what the AI may fill, composes the prompt, calls the provider and reads its answer: each field comes back empty, filled (verified by a quote of the source, or to check) or discarded with a reason. The gateway never writes to the backend.
- The providers `run` may call are the ones `providers` enables: Mapo's `mock`, which answers from fixtures, from lines such as `Title: About us`, or with a failure on command, and the ones an app registers with `registerMapoAiProvider()`.
- The prompt is composed in layers: Mapo's base rules, the app's (`instructions`, and the `mapo-ai:prompt` hook), the entity's context, the operator's instructions, then the source, which is data and never instructions.
- The app sets the verification rules (`verification`) and the limits (`limits`): calls per user per minute, the length of a source and of the operator's instructions.
- Every call that reaches a provider is audited in the storage: who, when, which provider and model, the tokens and the outcome, never the contents, for 90 days by default (`audit`).
- The gateway has an encrypted storage on the server, the Nitro mount `mapo-ai`, sealed with the secret `NUXT_MAPO_AI_SECRET`. The server checks the secret and the mount when it starts, and sweeps expired records every hour.
- `mapomodule/types` exports `MapoAiOptions`, `MapoAiStatus`, the types of `run` (`MapoAiRunRequest`, `MapoAiRunResponse` and the outcomes, `AiFieldOutcome`), of the providers (`MapoAiProvider`, `MapoAiMockFixture`) and of the hooks (`MapoAiUserContext`, `MapoAiPromptContext`).

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

| Route                  | Answer                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /_mapo/ai/status` | The version of the gateway's contract, whether the app lets the user use the AI and whether they administer it; to a user the app lets in, the `providers` with their models, the `default` and the `limits`; to an admin, also `storage` |
| `POST /_mapo/ai/run`   | What the AI proposes for a record, or for the records of a source, read field by field ([Ask the AI](#ask-the-ai))                                                                                                                        |

The contract version goes up when a route or a response changes in a way an older client cannot read. The answers are the user's own, so they carry `Cache-Control: no-store`.

```ts
import type { MapoAiStatus } from "mapomodule/types";

// In the browser the session cookie goes along with the request. During SSR
// $fetch sends no cookie: use $mapoFetch there, which forwards it.
const status = await $fetch<MapoAiStatus>("/_mapo/ai/status");
```

To a user the app lets in, `providers` lists what `run` may call for them, `default` what it calls when a request names nothing, and `limits` the limits of `run` ([Limits](#limits)). An empty `providers`, and no `default`, means `run` has no provider to call. To an admin, `storage` says whether the gateway can read and write its state, and why not, never the secret itself:

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
    "maxInstructionsChars": 2000
  }
}
```

`secret` is `set`, `temporary` (none is set and the server runs in development), or what keeps the storage closed: `missing`, `too-short` or `not-text` ([The secret and the storage](#the-secret-and-the-storage)). `driver` is the name of the driver mounted at `mapo-ai`, when it has one: `fs` with the module's default in `nuxt dev`, `fs-lite` on a Node server.

### A user the app refuses

`status` answers every signed-in user, also one the app's rules refuse ([Restrict who uses the AI](#restrict-who-uses-the-ai)). That user gets the `contract`, `"allowed": false` and `"admin": false`, with a 200, and nothing more: no `storage`, `providers`, `default` or `limits`. Every other route of the gateway refuses them with 403.

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

A route that changes something, as `run`, also refuses with 403 a request a browser marks as sent from another origin (`Sec-Fetch-Site` other than `same-origin`). Called with `$mapoFetch`, these errors behave as for any backend call: a 401 sends the user to the login page, and a 403 shows Mapo's permission-denied message. `run` has errors of its own ([Errors of run](#errors-of-run)).

## Who may use the gateway

### The session

The gateway does not log anybody in: it asks your backend who the request's session belongs to. It forwards the request's `cookie` header, and no other header, to [`userInfoApi`](/modules/core#options) (`/api/profiles/me/` by default), through your app's own server, the way Mapo restores the session when it renders a page. The proxy of a backend integration sees that call and handles its cookies as it does for any other, and in an app served under a base URL the call goes there too. A backend that answers 401, or 403 as Django REST Framework's session authentication answers a request without a session, means nobody is signed in.

The user is the object `userInfoApi` returns: an `id`, `is_superuser: true` for a superuser, the strings of `groups`, and the permission codenames of `all_permissions`, or of `user_permissions` when the first is missing, read as Mapo's auth store reads them. A payload without an `id` is no user, and the gateway answers 502.

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

Today an admin is told the state of the storage in `status`.

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

One of the two is enough. With both, the form's fields decide which fields exist and of which type, and the stricter limit of the two wins. From them the gateway builds what the AI may fill and the JSON Schema of its answer, with the same code a page can run: a field kept away from the AI (a password, a read-only value, a media, a key named like a secret or a token, `x-mapo-ai` with `exclude`) is never asked.

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

`readable` is `false` when the answer did not have the shape asked: then every field is empty. `warnings` lists what the gateway could not use. An extraction answers `result.items` instead, each item with its `type`, its `ref` and its `fields`. When the model refuses, `status` is `refused` and `refusal` holds what it wrote instead. `prompt` is the version of Mapo's base rules the prompt was composed with, and `usage` the tokens the provider counted.

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
| 403    | A provider or a model the app does not enable; no permission on the record's model; a request from another origin     |
| 413    | The body, the source or the operator's instructions are longer than the limits allow                                  |
| 415    | The body is not `application/json`                                                                                    |
| 422    | The AI may fill nothing, two entities of an extraction share an endpoint, or the descriptions are too large or deep   |
| 429    | The user made `perUserPerMinute` calls in the last minute; `Retry-After` says when to try again                       |
| 502    | The provider failed, or returned nothing the gateway can read                                                         |
| 503    | No provider is enabled, the storage is closed, or the provider is busy, with `Retry-After` when it says               |
| 504    | The provider did not answer within its `timeout`                                                                      |

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

Without `models` a provider offers its own (`["mock"]` for the mock); without `timeout` a call may take 120 seconds. `false` turns off a provider a layer enables. `default` names what a request that names nothing gets: without it, or when it names a provider the app does not enable, that is the first provider listed and its first model. With no provider enabled, `run` answers 503.

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

A fixture has a `name` (lowercase letters, digits, `-` and `_`), an `answer` written as a model writes it, or a `refusal`; optionally the `source` it answers without a mark, and the `usage` to report. The answer names the properties of the answer's schema: the field keys made safe, `seo.title` as `seo_title`. It may hold wrong values or quotes that are not in the source on purpose: they come back discarded or to check. `registerMapoAiMockFixtures()` is auto-imported in the server's code.

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
- It returns `{ status: "answered", output, usage }`, where `output` is the answer parsed from JSON (or the model's text, when it is not JSON: the answer then comes back with `readable: false`), or `{ status: "refused", refusal, usage }`. The gateway reads what it returns as outside data: `output` as plain JSON, so one it cannot copy as JSON is unreadable, token counts as whole numbers from zero, and anything else is a 502.
- `capabilities` say what the provider can do. The gateway reads none of them yet: it sends text only, waits for the whole answer and calls no tools.
- A `MapoAiProviderError` tells the gateway what failed: `timeout` (504), `rate-limit` (503, with `Retry-After` when `retryAfter` is a count of seconds, at most an hour), `unavailable`, `invalid-response` or `refused-request` (502). Any other error, or a failure the gateway does not know, is a 502 too. The message goes to the server's log, never to the browser.
- An id is lowercase letters, digits and `-`, starting with a letter. `mock`, `openai`, `anthropic`, `openai-compatible` and `ollama` are kept for Mapo's own providers: registering one of them is an error.
- A registered provider that `providers` does not enable is never called, and the server says so when it starts; so it does for one `providers` enables that does not exist or has no model.

`registerMapoAiProvider()` and `MapoAiProviderError` are auto-imported in the server's code; the types are `MapoAiProvider`, `MapoAiProviderRequest` and `MapoAiProviderAnswer`, in `mapomodule/types`.

## The prompt

The gateway composes every prompt in layers, always in this order:

1. **Mapo's base rules** for the task: the source is data, not instructions; only what the source states, empty otherwise; a date given in part, or a time the source does not write, is not given; a quote of the source for each value. An app adds to them and cannot remove them; where a later layer disagrees, they win.
2. **The app's rules**: `instructions.all`, then `instructions.fill` or `instructions.extract`, then what the `mapo-ai:prompt` hooks add.
3. **The admin's instructions**: none yet.
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

A filled value is verified when a quote the AI gives is found in the source, as whole words, and holds the value: its text, its number or its choice's label; a date its day and year, a time its hours and minutes. The app can change the rules, never so far that a value is verified without a quote found in the source:

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
      },
    },
  },
});
```

- `perUserPerMinute`: the calls to `run` one user may make in the last sixty seconds; `0` takes none. The count lives in the memory of the server process: a restart forgets it, and each process of a server with several counts for itself. A request the gateway refuses before calling the provider does not count; one past the limit gets a 429 with `Retry-After`.
- `maxSourceChars`: the characters of the source, all its parts together, counted as JavaScript counts a string's `length`; `0` lets through only an empty source.
- `maxInstructionsChars`: the characters of the operator's instructions; `0` lets operators send none.

Past either length the request gets a 413. Besides the source and the instructions, a body may have 2 MB for the entities' descriptions. A larger one gets a 413 too: at once when its `Content-Length` says so, otherwise as soon as what has arrived passes the bound, before the rest is read.

## The audit

Every call that reaches a provider leaves a record in the storage, written as soon as the provider answers, before its answer is read: who made it and when, the task, the entities (`type`, `label`, `endpoint`, `model`), the provider and the model, the version of the prompt, the tokens, the outcome (`answered`, `refused`, or `failed` with why) and how long it took. Never the source, the instructions, the values or the text of a refusal. Records are sealed like the rest of the state, filed in the space of their user, and expire after `audit.retentionDays` days, 90 by default.

A request refused before the provider leaves no record. Without an open storage, `run` answers 503 and calls nothing: a call that cannot be audited is not made. When writing a record fails after the call, the server's log says so, and the answer still reaches the user. No route reads the audit yet.

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

| Option         | Type                                                                                    | Default                                | Description                                                                       |
| -------------- | --------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `admin`        | `{ groups?: string[]; permissions?: string[] }`                                         | `{}`: superusers only                  | Who administers the AI ([Admins](#admins))                                        |
| `users`        | `{ groups?: string[]; permissions?: string[] }`                                         | Not set: every signed-in user          | Who may use the AI ([Restrict who uses the AI](#restrict-who-uses-the-ai))        |
| `providers`    | `Record<string, { models?: string[]; timeout?: number } \| false>`                      | `{}`: no provider, `run` answers 503   | The providers `run` may call, and their models ([Providers](#providers))          |
| `default`      | `{ provider?: string; models?: { fill?: string; extract?: string } }`                   | The first provider and its first model | What a request that names no provider or model gets                               |
| `instructions` | `{ all?: string; fill?: string; extract?: string }`                                     | `{}`                                   | The app's rules in every prompt ([The prompt](#the-prompt))                       |
| `verification` | `{ dateYear?, bareHours?, timeZones?, oneWordQuotes?, richTextLinks? }`                 | The prudent defaults                   | What a quote must hold for a value to be verified ([Verification](#verification)) |
| `limits`       | `{ perUserPerMinute?: number; maxSourceChars?: number; maxInstructionsChars?: number }` | `20`, `100000`, `2000`                 | The limits of `run` ([Limits](#limits))                                           |
| `audit`        | `{ retentionDays?: number }`                                                            | `{ retentionDays: 90 }`                | How long an audit record is kept ([The audit](#the-audit))                        |

The module reads every option when the app builds, and warns about what it cannot read. A value it cannot read never widens what the AI may do: a `users` that names no group or permission it can read lets in only superusers and the AI's admins, a provider it cannot read is not enabled, and a limit it cannot read is `0`, the narrowest. A rule of verification, or the audit's retention, that it cannot read keeps its default. The options reach the server in its private runtime config, never in the public one, complete with their defaults, so the environment can change one when the server starts, with Nuxt's variables: `NUXT_MAPO_AI_LIMITS_PER_USER_PER_MINUTE=50`. An option with no default that the config does not set, such as `default.provider`, is not in the runtime config, so no variable reaches it. The server reads the options again with the same rules, and logs once a value it cannot read. Nuxt merges the options as any configuration: across layers, and `mapoAi` with `mapo.ai`, lists add up instead of replacing each other, so a layer's `groups` and the app's are all kept.

The secret is not an option: it is the environment variable `NUXT_MAPO_AI_SECRET`, read when the server starts.

# AGENTS.md — `@mapomodule/ai`

Local rules for the AI-assisted data entry package. The root [`AGENTS.md`](../../../AGENTS.md) still applies; the public page is [`docs/modules/ai.md`](../../../docs/modules/ai.md).

## What this package is

An experimental, opt-in Nuxt module. The meta-module installs it only when the app sets `mapo.ai`; registered on its own it reads `mapoAi`. Today it registers the **AI gateway** on the app's Nitro server, under `/_mapo/ai/*`. The gateway knows the user from the **backend session**, forwarding the request's cookie to `userInfoApi`, and answers signed-in users: `GET status`, what it offers them (and to admins the state of the storage); `POST read`, which reads a file into the text `run` takes, with the reader of its format, Mapo's or one the app registers in its place or for a format of its own; and `POST run`, which builds what the AI may fill from a record's two descriptions, composes the prompt in layers, calls a **provider** (Mapo's `mock`, `openai`, `anthropic`, `ollama` or `openai-compatible`, or one the app registers and enables) with the **key nearest the user** (their own token where an admin allows it, a key the admins assign through `/_mapo/ai/keys`, the project's) and answers the sanitized outcome of each field. In the browser, **`useMapoAiRead()`** sends a file to `read`, and **`useMapoAiFill()`** fills a detail form through `run`: it writes each value a quote verifies into an empty field, and marks every other one for the operator. **Magic Fill** puts it on every `MapoDetail`, through a plugin the module generates in an app with uikit: a button in the sidebar card opens a panel (a text, files, the operator's instructions, "What I send to the AI" from `run/preview`, the model), and a banner above the form follows the call and sums up its answer. The module also adds the **AI settings page** (`/ai-settings`, or the component `MapoAiSettings` where the app places it): each user picks a provider and a model, sees which key their calls use, saves their own token where allowed and checks the connection, and the AI's admins assign the keys and change how the AI works in the whole app (instructions, rules of verification, words of secrets, the providers' cache, fallbacks and added models), within what the app allows. The gateway's state has a **sealed storage**: the Nitro mount `mapo-ai`, every record encrypted with a key derived from `NUXT_MAPO_AI_SECRET`; `run` writes its audit there.

## Layout

```text
src/
  module.ts                  Nuxt module: the gateway routes (addServerHandler), the plugins, the settings page
                             (extendPages) and MapoAiSettings (addComponent), the server's auto-imports
                             (registerMapoAiProvider, MapoAiProviderError, registerMapoAiMockFixtures, registerMapoAiReader),
                             the app's (useMapoAiFill, useMapoAiRead), the secret and the options in private runtime config,
                             every reader of Mapo's place in it, the default mount at `ready`, the hooks' types
  storage.ts                 build time: the file-system default of the `mapo-ai` mount, as Nitro does for `data`
  access.ts                  build time: the `admin` and `users` options, read with a warning for what cannot be read
  settings.ts                build time: the `settings` option (the page's path and label, the users' and groups' endpoints)
  index.ts                   public types (MapoAiOptions, MapoAiStatus, MapoAiUserContext…), also re-exported by
                             mapomodule/types
  runtime/shared/            pure TypeScript shared by the module, the server and the browser:
                               gateway.ts  route prefix, contract version, the routes' bodies and responses
                               dialect.ts  the `x-mapo-ai` keyword (hint, exclude) of the JSON Schema dialect
                               entity.ts   the entity model: what the AI may fill, built from the backend schema
                                           and the form's fields, with skipped fields and warnings; objects as
                                           dotted fields, repeaters as lists of items read as entities of their own
                               contract.ts what the AI is asked to return (fill, extract): the strict schema of the
                                           answer, in the subset every provider accepts, and the fields behind it
                               sanitize.ts the answer checked against its contract: typed values, discarded ones with
                                           their reason, quotes verified against the source by rules with prudent
                                           defaults (`AiVerificationRules`); a list item by item (`outcomesByPath`)
                               markdown.ts the restricted Markdown of rich text, to HTML from a closed list of tags
                               citations.ts finding a quote in the source, and a value in a quote: words, numbers,
                                           points of a map, dates, times and time zones, links
                               numbers.ts  numbers as the backend checks them (`multipleOf`)
                               patterns.ts the bound on a pattern's work, before the sanitizer runs it
                               fill.ts     the browser's half of `run`: the request from the two descriptions, the
                                           answer read as outside data, what goes into the form (`planMapoAiFill`),
                                           the model's paths, and the operation `runMapoAiFill()`
                               read.ts     the browser's half of `read`: the file sent as a form, the answer read as
                                           outside data (`readMapoAiFile()`)
                               magicFill.ts Magic Fill's pure half: `status` read as outside data, the models to pick,
                                           the source checked against the limits, the preview of a call, the summary
                               guards.ts   type guards for outside values
                               settings.ts the users and groups of a backend's answer, for the settings page
                                           (`principalsOf()`)
  runtime/composables/       useMapoAiFill.ts: the plan applied to a detail form, its marks, restore and undo, waiting
                             and failing; useMapoAiRead.ts: a file sent to `read`; useMapoAiMagicFill.ts: Magic Fill's
                             state, one per detail; useMapoAiStatus.ts: `status`, once per app; poster.ts: how they call
                             the gateway (`$mapoFetch`); translate.ts: the app's `t()`; settingsClient.ts: how the
                             settings page calls the gateway and the backend, and translates; for the browser, with Vue
                             and `useNuxtApp()`
  runtime/components/        Magic Fill's parts, registered by name: MapoAiMagicFillAction (the button), ...Banner (the
                             call and the summary, above the form), ...Panel, ...Preview ("What I send to the AI");
                             the settings page's parts: MapoAiSettings (the page's content), ...Personal (preference,
                             token, check), ...Keys (assignments, order of the groups, tokens), ...Assignment (the
                             editor of one), ...Principal (a user or a group, searched on the backend), ...Behaviour
                             (how the AI works, for the admins) with ...Instructions, ...Rules, ...Secrets, ...Providers,
                             ...Usage (everyone's for the admins, the user's own), ...Actions (the changes)
  runtime/pages/             ai-settings.vue, the page the module adds
  runtime/server/auth/       who calls the gateway:
                               user.ts     the user read from `userInfoApi`'s answer (zod); the rules: admin, users,
                                           a model's permission; pure
                               session.ts  the backend's answer for a cookie, remembered 30 seconds; pure
                               nitro.ts    the wiring: readMapoAiCaller(event), requireMapoAiSession(event),
                                           requireMapoAiAdmin(event), requireModelPermission(); Nitro's local fetch,
                                           the hooks, the cross-site check
                               hooks.ts    the `mapo-ai:user`, `mapo-ai:prompt` and `mapo-ai:read` hooks, typed for the
                                           app's server code
  runtime/server/run/        the `run` route's parts:
                               request.ts  the body as outside data: JSON by type, a size bound, zod on the envelope
                               contract.ts the contract, built by the gateway from the two descriptions of each entity
                               options.ts  the options of `run` and `read`, read at build time and at runtime alike; pure
                               policy.ts   which provider and model a request gets, for one user too; pure
                               limiter.ts  each user's calls of the last minute, in memory; pure
                               audit.ts    the audit record, its key, its validator, its write
                               run.ts      the operation, its dependencies passed in; the `mapo-ai:prompt` context
                               nitro.ts    the wiring: runtime config, registry, storage, limiter, the prompt hooks,
                                           the user's policy with the admins' keys (mapoAiUserPolicy)
  runtime/server/providers/  types.ts (MapoAiProvider, MapoAiProviderError), registry.ts (registerMapoAiProvider, the ids
                             Mapo keeps, Mapo's providers built from their settings), mock.ts (the mock provider and its
                             fixtures); the cloud models: openai.ts, anthropic.ts, with cloud.ts (their addresses, the
                             effort, the cap with the reasoning, the key, refused parameters, an enum's case); the local models:
                             ollama.ts, openaiCompatible.ts, with local.ts (the server's address, the schema in the
                             prompt, the tokens, the models' details); http.ts for all (calls, failures, masked keys,
                             streams read within a bound)
  runtime/server/readers/    the `read` route's parts: types.ts (MapoAiReader, the hook's context), registry.ts
                             (registerMapoAiReader, Mapo's readers, the reader of a file), text.ts (bytes as text; text,
                             Markdown, JSON), html.ts (HTML into Markdown, a tokenizer of its own), sheets.ts (CSV and XLSX
                             into Markdown tables, the CSV parser, the bound on what an XLSX unzips), read.ts (the
                             operation), upload.ts (the request), nitro.ts (the wiring: the readers on, limits, hooks)
  runtime/server/keys/       the keys on three levels: assignments.ts (the admins' record and its changes, the routes'
                             bodies; pure), chain.ts (the models, personal tokens and key of a provider for a user;
                             pure), store.ts (the record and the tokens in the storage, one change at a time, 503 when
                             unreadable), nitro.ts (the routes' storage, who acts, the audit of a change)
  runtime/server/settings/   preferences.ts (the user's provider and model, sealed in their space), connection.ts (the
                             check of a connection: the provider's list of models with the user's key), admin.ts (the
                             admins' settings: the record, a change checked against the app, applied to a request;
                             pure), store.ts (the record in the storage, one change at a time, 503 when unreadable)
  runtime/server/usage/      report.ts (the period, a call's cost, the sums by user, model and day, the changes; pure),
                             read.ts (the audit's records of a period: only those its days file)
  runtime/server/body.ts     a request's body read up to a bound, for `run`, `read` and the keys
  runtime/server/prompts/    base.ts (Mapo's base rules, MAPO_AI_PROMPT_VERSION), compose.ts (the prompt in layers)
  runtime/server/storage/    the sealed storage of the gateway's state:
                               sealed.ts   envelopes (AES-256-GCM, WebCrypto), a key per purpose (HKDF), users as keyed
                                           hashes, expiry, the sweep; pure, the storage and the secret are passed in
                               secret.ts   NUXT_MAPO_AI_SECRET read as outside data; the log lines about it
                               nitro.ts    the wiring to the mount and the runtime config: useMapoAiStorage(event),
                                           and mapoAiStorageState(event) for `status`
  runtime/server/plugins/    Nitro plugins: storage.ts checks the storage when the server starts and sweeps hourly;
                             providers.ts names in the log the providers `run` will not call, and the models a
                             provider's server does not list
  runtime/server/routes/     Nitro handlers, one file per route
  __tests__/                 Vitest; gateway routes on a bare h3 app; the storage's wiring, its plugin and the
                             module with `nitropack/runtime` and `@nuxt/kit` mocked
```

## Rules

1. **Opt-in, nothing loaded otherwise.** An app without `mapo.ai` must not get a route, a plugin, a component or a dependency loaded from this package. Keep the check in `packages/mapomodule/src/module.ts`.
2. **Options arrive with their behaviour.** An option is added in the change that makes it do something, with a default, JSDoc and a row in `docs/modules/ai.md`. No option is documented before it works.
3. **Gateway routes live under `/_mapo/ai/`**, never under `/api/*`, where backend integrations proxy to the real backend. The prefix and the gateway's version (`MAPO_AI_CONTRACT_VERSION`) are in `runtime/shared/gateway.ts`; raise it when a route, a body or a response changes in a way an older client cannot read. The format of a task contract has its own version, `AI_CONTRACT_FORMAT_VERSION` in `contract.ts`. No route carries a contract, since the gateway compiles it (`run/contract.ts`), but every provider receives one (`request.contract`): a change to its format breaks an app's provider (`feat(ai)!`), and raises the gateway's version only when a body or a response changes with it.
4. **Server code imports explicitly**: `h3` for handlers and helpers (a dependency), `nitropack/runtime` for runtime config and storage (`nitropack` goes in devDependencies, for its types). Never `#imports`: auto-imports do not run in `node_modules`, and the package is type-checked outside Nuxt, with `vue-tsc`.
5. **`runtime/shared/` stays pure**: no Nuxt, Nitro, Vue or Node imports, so the browser and the server can both use it. It may import the pure helpers of `@mapomodule/utils` and, by subpath, the form's schema reader and writer (`@mapomodule/form/runtime/composables/useFormFromSchema`, `@mapomodule/form/runtime/utils/fieldsToJsonSchema`).
6. **Secrets stay on the server.** Keys and secrets go in the private `runtimeConfig`, never in `runtimeConfig.public`, a response, a log or an audit record. They are set at runtime, from the environment (`NUXT_MAPO_AI_SECRET`, `NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY` for an app's provider), or by the admins and the users through the routes of the keys, which seal them in the storage: a value written in the Nuxt config is copied into the server bundle, and the module warns about it. A provider's key is read by `providerKeyOf()`, apart from the options of `run`, which never carry it; the log may say that a key is not text, is missing or travels in clear, never the key, and a server's message is logged with what looks like a key masked (`maskKeys()`).
7. **Outside data is `unknown`** until a validator turns it into a typed value: request bodies, provider responses, files, rendered HTML and stored records. Never cast it with `as`. A provider's answer goes through `sanitize.ts`, which reads it property by property and never throws on it: what it cannot use is empty, discarded with a reason, or a warning.
8. **Nothing that keeps the AI out may be lost.** A secret, a read-only value, an exclusion or a media type counts wherever a schema writes it: beside a union, in one of its branches, behind a `$ref`, on an object around a dotted key (even when the path stops before the value), in a part of the schema the form's reader cannot read, inside the items of a list, in every declaration of a nested value on either side, on a part of a point (`place.lat`). The reader resolves for display and drops some of these; `entity.ts` looks through every variant, reads an unreadable schema property by property, and asks the schemas around a nested value for every path inside it (`speakers.*.pin`). A key names a secret with the keys around it (`api.key`). A new keyword of this kind gets a regression test on both sides of the merge.
9. **One schema for every provider.** The contract's schema stays in the subset that every provider accepts in strict mode: objects with every key in `required` and `additionalProperties: false`, strings, arrays, string `enum`s, at most one `anyOf` and never at the root; no `null`, no numeric or length limits, no formats; at most 250 values in one `enum`, 1000 in all; at most 5000 properties, 10 levels of nesting (every schema on the way, the root and the leaf included: a list that would go deeper is left out, in `omitted`) and 100,000 characters of property names and enum values; property names of letters, digits and `_`, up to 64 characters. A value the source does not give is `""` or an empty list. What the schema cannot say goes in the property's description, and the sanitizer applies it. The compiler measures the schema it builds and moves lists to the descriptions until it fits, or throws. `expectPortable()` in `__tests__/portable.ts` checks the subset: a new keyword needs the current docs of every provider first.
10. **Every action is an operation.** What the UI does is also callable without the UI, with typed input and output and its dependencies passed in. Writes to the backend always need the operator's confirmation; the gateway itself never writes to the backend.
11. **The state is sealed, and fails closed.** What the gateway keeps goes through `useMapoAiStorage(event)`, never `useStorage()` directly. Without a usable secret or a mount the storage is closed: no clear text, no memory of one process. A record that does not open is never deleted: only its expiry or a new value removes it. Stored values are outside data (rule 7): read them with a validator.
12. **Every route starts with the session.** A handler calls `requireMapoAiSession(event)`, or `requireMapoAiAdmin(event)`, before it reads anything else, and sets `Cache-Control: no-store` when the answer is the user's own; only a route that tells the user what they may do, as `status`, uses `readMapoAiCaller(event)` and answers a refused user (`allowed: false`) instead of a 403. The gateway keeps no session of its own: it forwards the request's `cookie`, and no other header, to `userInfoApi` by Nitro's local fetch, as core restores the session. A backend that cannot say who is signed in gets a 502, never a 401. A rule that cannot be read picks fewer users, never more; an app narrows access with the `mapo-ai:user` hook, which can only refuse: its `allowed` is a latch, so a later hook never undoes an earlier refusal. Permissions are read by `userPermissions()` of `@mapomodule/utils`, as the auth store reads them.
13. **No pattern runs unbounded.** A field's patterns come from the schemas, which may come from outside: the sanitizer runs one only when `patterns.ts` bounds its work on the value, and a value whose pattern could not be tested (too costly, unreadable, or failing while it runs) is kept and never verified. A new way of testing values against an outside expression gets the same bound.
14. **`run` builds what it asks, and spends last.** The gateway compiles the contract itself from the descriptions the page sends (`run/contract.ts`), never from a contract a client sends, so the rules a contract holds inside hold by construction; zod reads only the envelope. The order in `runMapoAi()` keeps the cost for last: provider, model, permission and the user's limit (looked at, not counted) come before the contract and the hooks, and the limit counts a call only once they have passed; without the storage no call is made. A provider is called only when `mapo.ai.providers` enables it, gets copies of what it is asked, and its answer is outside data, read as plain JSON; the call is audited as soon as it answers, before its answer is read. The prompt is composed in the gateway: what the server holds (Mapo's base rules, the app's, the admin's) comes before what the request writes, and an app's rules and hooks add, never remove. The audit holds metadata only, never the source, the instructions or the values. An option of `run` that cannot be read never widens what may spend: a provider is not enabled, a limit is `0`. A page that goes away closes its request, and the provider's call stops (`cancelled` in the audit; before the limit counts, the request is dropped); only the gateway says `cancelled`. The preview of a call (`run/preview`) runs the same checks and composition, tells the hooks it is a preview, and stops before the provider: no count against `run`'s limit, a limit of its own, no audit, never the source's text back.
15. **The page writes only what the answer verifies on an empty field it shows, as the form writes, and undoes only its own.** `useMapoAiFill()` reads the answer of `run` as outside data (`readMapoAiFillResponse()`), and writes by itself only a value whose action is `apply`: verified, on a field that holds nothing and that the form shows. Everything else waits for the operator, marked at the field's value path, where the form looks. It writes only the keys the form's fields declare, through own properties and never through a segment that leads to a prototype, and as `useMapoForm()` writes: the field's accessor, every language of a `synci18n` field, `onChange`; keep the two in step. A field is empty only when every path the write would reach is (`writePaths()`, the plan's `pathsOf`). `restore()` and `undo()` put back only what still holds the AI's value, removing the keys and objects it added, and it removes only its own marks. The fields, the language and `isNew` are read after the `OPTIONS`. A related record is never written before someone finds it. Labels come from `mapo.ai.*`, and the shared `mapo.apply` and `mapo.restore`, in both catalogs of `@mapomodule/i18n`.
16. **A local model never reads a cut prompt in silence.** Mapo's providers for local models call only the address the app sets (`baseURL`, read by `serverURL()`), never one from a request. They put the answer's schema in the prompt, cap the answer by the schema's size, stream from the server, and turn a prompt the model cannot read whole into `too-long` and an answer cut at its cap into `truncated`: Ollama gets `truncate: false` and `shift: false`, since by default it cuts the prompt, rules first, without an error, and the provider calls only the Ollama version it was verified with or a later one; an OpenAI-compatible server is checked against the context its list or `contextTokens` says, before and after the call, and a prompt cut to the context is `too-long` even when the answer then ran out of room. Both local providers check after the call that the server read the whole prompt. Calls go through `http.ts`, which reads what a server sends within a bound, follows no redirect and logs only the message of an error.
17. **A cloud model is asked for what the app allows, and named when another answers.** `openai` and `anthropic` send the schema only as the API's structured output (the API shows it to the model), store nothing at OpenAI (`store: false`), send no sampling parameter, ask the app's `effort` (`low` by default) and cap the answer with room for the reasoning. They write to a prompt cache only with `promptCache`, after the stable part and never on the source, and otherwise mark nothing, so OpenAI writes nothing by itself; a model that refuses the cache's options gets none, and the log says that OpenAI then caches by its own rules. A call to the provider's own servers without a key fails before it is made. A model whose refusal says it does not take an optional parameter (an effort, the cache's options, Anthropic's fallbacks) is asked again without it, through `callCloud()`, and its calls leave it out for ten minutes once a call without it is taken; a refusal for the money, the rate or the context is never read as one of a parameter, and `store`, the schema and the cap are never dropped. A failure after the call was taken carries its usage, which the audit keeps. Anthropic's fallbacks may answer with a model the app does not list: the provider's answer names it (`model`), and `run` puts it in its answer and its audit. Anthropic does not guarantee the case of an `enum`'s values, so its provider writes a value that differs from its schema's only by case as the schema does (`withEnumCase()`), and only when one value matches.
18. **A file becomes text, whole, by a reader the app can replace.** `read` takes one file per request, read up to `maxFileBytes` before the form is parsed. It goes to the reader of its name's extension, then of its media type, the app's readers before Mapo's, and an app's reader with the id of one of Mapo's takes its place; `mapo.ai.readers` turns any off, and a format that is off stays off: when readers list the extension and all are off, the media type never brings the file to another (`readerOf()`). Every reader writes text parts named after the file, and checks the content, never trusting the name or the type; a format that unpacks (XLSX) is bounded by what it really unpacks, never by what it declares, and by what the library will build from it (a sheet's grid), before the library reads it; a reader's dependency is imported inside `read()`, and no work grows faster than the file (the HTML reader caps the marks open at once). What a reader or a `mapo-ai:read` hook gives is outside data (`partsOf()`), and a text longer than `maxSourceChars` is `too-long`, never cut. `read` keeps nothing and calls no AI, and its log names no file. The hook sees files only: it is no boundary for what reaches a provider.
19. **The key nearest the user, never more than the admins decided.** For each provider the nearest assignment (the user's, their groups' by the admins' order, everyone's) decides the models, within those `mapo.ai.providers` enables, and whether personal tokens are allowed; the key is the user's token where allowed, else the first key up the assignments, else the project's (`keys/chain.ts`). Personal tokens are off unless an assignment allows them. A provider that needs a key and has none is refused before the call. The admins' record is one sealed record; one that is there and does not open closes the AI with a 503 instead of giving users more than the admins decided. No answer, log, error or audit record holds a key: `last4()` only, for a key of 16 characters or more, and zod's message is replaced for a key or a token. Mapo's providers are built again with the user's key at each request; an app's provider that declares `key` gets it as `request.apiKey`.
20. **The settings page is a client, and checks nothing for the server.** Its components call the gateway's routes and the app's users and groups endpoints through `settingsClient.ts`, and every choice they offer (a preference, a token, an assignment) is checked again by the route. The preference applies only within what the user is given (`policyForUser()`). The check of a connection only lists a provider's models with the user's key, at no cost, within a timeout and 10 checks a minute per user, and names how it failed, never the key. The page is added only when the app has no route at its path, and `settings.path: false` leaves it out; labels come from `mapo.ai.settings.*` in both catalogs; the components' Tailwind classes reach the app through the `@source` of uikit's `main.css`.
21. **The admins work within the app's frame, and their settings fail closed.** The app's options are the defaults: the admins change the instructions (layer 3 of the prompt), the rules of verification, the words of secrets and the prompt cache, and widen the models or the spending only where the app allows it (`adminModels`, `fallbacks`). `withAdminSettings()` applies their record to the options of each request; a record that does not open closes the AI with a 503, as the keys' does. A model they add is saved only once the provider's server lists it, asked with the admin's own key. The audit names the blocks changed and every rule made less prudent than the app's or Mapo's default, never the instructions or the words. Nothing removes Mapo's names of secrets (rule 8).
22. **The usage is read, never counted.** It is summed from the audit when the page asks for it (`usage/`): `run` writes one record per call and nothing else. A reading opens only the records of its period, by the day their keys write, and a bounded number of them. The admins read every user's usage and the changes; a user only their own space. A cost exists only where the app prices the model (`mapo.ai.prices`): Mapo keeps no price list. The usage never shows what was sent, since the audit never holds it.
23. **Magic Fill is a client of `useMapoAiFill()` on every detail.** It adds no rule of what goes into a form: the composable decides, and the summary applies only what its marks apply, never into a hidden field. The module adds it with a plugin generated in the app (`addPluginTemplate`), only when uikit is installed and `magicFill` is not `false`: the package never imports uikit, and reads `defineDetailExtension()` and `useMapoDetail()` from the app's `#imports` and its components from `#components`, so a MapoOverride replaces them. A page turns it off with `meta.magicFill: false`. Its state lives once per detail, outside the components (`useMapoAiMagicFill()`), so closing the panel never stops or loses a call; the last component to go cancels it. `status` and the preview are outside data, read by `shared/magicFill.ts`; what the panel checks before Extract repeats what `run` checks, and `run` still checks it. Labels come from `mapo.ai.magicFill.*` in both catalogs.

## Change together

| You change                       | Also change                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A route or its response          | `runtime/shared/gateway.ts` (types, `MAPO_AI_CONTRACT_VERSION`), routes in `docs/modules/ai.md`                 |
| An option                        | Its default in `module.ts`, `docs/modules/ai.md`, `README.md` if the installation changes                       |
| Who may call the gateway         | `runtime/server/auth/`, `access.ts` for the options; `status.test.ts`, `user.test.ts`; the hook's docs          |
| How a user's permissions read    | `userPermissions()` in `@mapomodule/utils`, which the auth store shares: both change together                   |
| How the meta-module installs it  | `packages/mapomodule/src/module.ts`, `docs/guide/concepts.md`, `packages/mapomodule/README.md`                  |
| What the package does, in a line | `docs/guide/concepts.md`, `docs/guide/feature-status.md`, `mcp/src/runtime/core/instructions.ts`                |
| A value kind or a skip reason    | `entity.ts`; `contract.ts` (`KIND_RULES`, `PROSE_KINDS`); `convert()` in `sanitize.ts`; the tables of the tests |
| The contract's shape             | `AI_CONTRACT_FORMAT_VERSION`, `expectPortable()`, `sanitize.ts`, the mock (it reads `request.contract`)         |
| A tag of rich text               | `markdown.ts` and the extensions of `MapoWygEditor`: the editor must accept every tag the AI's HTML has         |
| A verification rule              | `AiVerificationRules`, `DEFAULT_VERIFICATION_RULES`, `verificationRulesOf()` in `sanitize.ts`; the tests        |
| A storage purpose                | `STORAGE_PURPOSES` in `storage/sealed.ts`; never rename one that has records: its key comes from the name       |
| The chain of keys                | `keys/chain.ts`, `keys.test.ts`, `keys-routes.test.ts`, the Keys sections of the module's two docs pages        |
| The preference or the check      | `server/settings/`, `policyForUser()` in `policy.ts`, `settings.test.ts`, `keys-routes.test.ts`, the docs       |
| A part of the settings page      | `mapo.ai.settings.*` in both catalogs; uikit `main.css` if the folder moves; the check in `apps/example-ai`     |
| A setting of the admins          | `settings/admin.ts`, `shared/gateway.ts`, its block of the page, `mapo.ai.settings.behaviour.*`, the docs       |
| A name of a secret               | `SECRET_WORDS`, `SECRET_ENDINGS`, `SECRET_PAIRS` and `MAPO_SECRET_NAMES` in `entity.ts`; `entity.test.ts`       |
| The audit record's format        | `AUDIT_RECORD_VERSION` (from the first release on), `usage/report.ts`, `usage.test.ts`, the docs' Usage         |
| An option of `run`               | `run/options.ts` and its warnings, `MapoAiOptions` in `index.ts`, `module.test.ts`, the docs' options           |
| The body or the answer of `run`  | `run/request.ts` (zod), `shared/gateway.ts` (types), the reader in `shared/fill.ts`, `run.test.ts`, the docs    |
| A base rule of the prompt        | `prompts/base.ts` and `MAPO_AI_PROMPT_VERSION`, `prompts.test.ts`                                               |
| A failure of a provider          | `MapoAiProviderFailure`, `FAILURES` in `run/run.ts`, the audit's validator, the docs, `useMapoAiFill.ts`        |
| A provider of Mapo               | `MAPO_PROVIDERS`, reserved ids; `SERVER_PROVIDERS` in `run/options.ts`; `__tests__/recorded/` or `documented/`  |
| A reader of Mapo                 | `MAPO_READERS` in `readers/registry.ts`; its format in `docs/modules/ai.md`; `status.test.ts`, `module.test.ts` |
| The answer of `read`             | `MapoAiReadResponse` in `shared/gateway.ts`, `readMapoAiReadResponse()` in `shared/read.ts`, `read.test.ts`     |
| The sealed record's format       | `ENVELOPE_VERSION` in `storage/sealed.ts`, keeping the previous format readable; the storage tests              |
| What goes into a form by itself  | `actionOf()` and `isEmptyFormValue()` in `fill.ts`, `fill.test.ts`, the table of the docs' "Fill a detail form" |
| A mark or a message of the fill  | `mapo.ai.fill.*`, `mapo.ai.errors.*` in both `mapo.{en,it}.json` of `@mapomodule/i18n`; `useMapoAiFill.test.ts` |
| How the form writes a value      | `writeField()` of `useMapoAiFill.ts`, which repeats `setFieldValue()` of the form's `useMapoForm.ts`            |
| A part of Magic Fill             | `MAGIC_FILL_COMPONENTS` and the plugin in `module.ts`; `mapo.ai.magicFill.*`; the docs' "Magic Fill"            |
| What the panel checks            | `checkMapoAiSource()` in `magicFill.ts`, in step with `run/request.ts`; `magicFill.test.ts`                     |
| The answer of `status`           | `readMapoAiStatus()` in `magicFill.ts`, `magicFill.test.ts`                                                     |

## Verify

```bash
pnpm --filter "@mapomodule/ai..." build   # ai and what it depends on: the tests run the form's built reader
pnpm --filter @mapomodule/ai test
pnpm --filter @mapomodule/ai typecheck
pnpm --filter @mapomodule/ai lint
```

Live: `apps/example-e2e` sets `mapo.ai`, so the gateway answers while `pnpm dev:example-e2e` runs: `curl http://localhost:3000/_mapo/ai/status` gets a 401, and with the mock API's session cookie, `-H 'cookie: __mapo_session=admin'` (a superuser) or `__mapo_session=editor`, the user's status. `run` calls the mock, which the app enables: post `{"task":"fill","entity":{"fields":{…}},"parts":[{"kind":"text","text":"Title: About us"}]}` with `content-type: application/json` and the same cookie, and add `#mock:refusal` or `#mock:rate-limit` to the text for its failures. Without `NUXT_MAPO_AI_SECRET` the dev server warns that it seals with a temporary secret, and the state, the audit records of `run` included, goes to `apps/example-e2e/.data/mapo-ai`. Stop the dev server afterwards. The AI settings page is off in `apps/example-e2e`: check it in `apps/example-ai` (`pnpm dev:example-ai`, port 3002), which enables `openai` and `anthropic` with no mock.

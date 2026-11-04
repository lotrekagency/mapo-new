# AGENTS.md — `@mapomodule/ai`

Local rules for the AI-assisted data entry package. The root [`AGENTS.md`](../../../AGENTS.md) still applies; the public page is [`docs/modules/ai.md`](../../../docs/modules/ai.md).

## What this package is

An experimental, opt-in Nuxt module. The meta-module installs it only when the app sets `mapo.ai`; registered on its own it reads `mapoAi`. Today it registers the **AI gateway** on the app's Nitro server, under `/_mapo/ai/*`. The gateway knows the user from the **backend session**, forwarding the request's cookie to `userInfoApi`, and answers signed-in users: `GET status`, what it offers them (and to admins the state of the storage), and `POST run`, which builds what the AI may fill from a record's two descriptions, composes the prompt in layers, calls a **provider** (Mapo's `mock`, or one the app registers and enables) and answers the sanitized outcome of each field. In the browser, **`useMapoAiFill()`** fills a detail form through `run`: it writes each value a quote verifies into an empty field, and marks every other one for the operator. The gateway's state has a **sealed storage**: the Nitro mount `mapo-ai`, every record encrypted with a key derived from `NUXT_MAPO_AI_SECRET`; `run` writes its audit there.

## Layout

```text
src/
  module.ts                  Nuxt module: the gateway routes (addServerHandler), the plugins, the server's auto-imports
                             (registerMapoAiProvider, MapoAiProviderError, registerMapoAiMockFixtures), the app's
                             (useMapoAiFill), the secret and the options in private runtime config, the default mount at
                             `ready`, the hooks' types
  storage.ts                 build time: the file-system default of the `mapo-ai` mount, as Nitro does for `data`
  access.ts                  build time: the `admin` and `users` options, read with a warning for what cannot be read
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
                               guards.ts   type guards for outside values
  runtime/composables/       useMapoAiFill.ts: the plan applied to a detail form, its marks, restore and undo, waiting
                             and failing; for the browser, with Vue and `useNuxtApp()`
  runtime/server/auth/       who calls the gateway:
                               user.ts     the user read from `userInfoApi`'s answer (zod); the rules: admin, users,
                                           a model's permission; pure
                               session.ts  the backend's answer for a cookie, remembered 30 seconds; pure
                               nitro.ts    the wiring: readMapoAiCaller(event), requireMapoAiSession(event),
                                           requireMapoAiAdmin(event), requireModelPermission(); Nitro's local fetch,
                                           the hooks, the cross-site check
                               hooks.ts    the `mapo-ai:user` and `mapo-ai:prompt` hooks, typed for the app's server code
  runtime/server/run/        the `run` route's parts:
                               request.ts  the body as outside data: JSON by type, a size bound, zod on the envelope
                               contract.ts the contract, built by the gateway from the two descriptions of each entity
                               options.ts  the options of `run`, read at build time and at runtime by the same rules; pure
                               policy.ts   which provider and model a request gets; pure
                               limiter.ts  each user's calls of the last minute, in memory; pure
                               audit.ts    the audit record, its key, its validator, its write
                               run.ts      the operation, its dependencies passed in; the `mapo-ai:prompt` context
                               nitro.ts    the wiring: runtime config, registry, storage, limiter, the prompt hooks
  runtime/server/providers/  types.ts (MapoAiProvider, MapoAiProviderError), registry.ts (registerMapoAiProvider, the ids
                             Mapo keeps), mock.ts (the mock provider and its fixtures)
  runtime/server/prompts/    base.ts (Mapo's base rules, MAPO_AI_PROMPT_VERSION), compose.ts (the prompt in layers)
  runtime/server/storage/    the sealed storage of the gateway's state:
                               sealed.ts   envelopes (AES-256-GCM, WebCrypto), a key per purpose (HKDF), users as keyed
                                           hashes, expiry, the sweep; pure, the storage and the secret are passed in
                               secret.ts   NUXT_MAPO_AI_SECRET read as outside data; the log lines about it
                               nitro.ts    the wiring to the mount and the runtime config: useMapoAiStorage(event),
                                           and mapoAiStorageState(event) for `status`
  runtime/server/plugins/    Nitro plugins: storage.ts checks the storage when the server starts and sweeps hourly;
                             providers.ts names in the log the providers `run` will not call
  runtime/server/routes/     Nitro handlers, one file per route
  __tests__/                 Vitest; gateway routes on a bare h3 app; the storage's wiring, its plugin and the
                             module with `nitropack/runtime` and `@nuxt/kit` mocked
```

## Rules

1. **Opt-in, nothing loaded otherwise.** An app without `mapo.ai` must not get a route, a plugin, a component or a dependency loaded from this package. Keep the check in `packages/mapomodule/src/module.ts`.
2. **Options arrive with their behaviour.** An option is added in the change that makes it do something, with a default, JSDoc and a row in `docs/modules/ai.md`. No option is documented before it works.
3. **Gateway routes live under `/_mapo/ai/`**, never under `/api/*`, where backend integrations proxy to the real backend. The prefix and the gateway's version (`MAPO_AI_CONTRACT_VERSION`) are in `runtime/shared/gateway.ts`; raise it when a route, a body or a response changes in a way an older client cannot read. The format of a task contract has its own version, `AI_CONTRACT_FORMAT_VERSION` in `contract.ts`. No route carries a contract, since the gateway compiles it (`run/contract.ts`), but every provider receives one (`request.contract`): a change to its format breaks an app's provider (`feat(ai)!`), and raises the gateway's version only when a body or a response changes with it.
4. **Server code imports explicitly**: `h3` for handlers and helpers (a dependency), `nitropack/runtime` for runtime config and storage (`nitropack` goes in devDependencies, for its types). Never `#imports`: auto-imports do not run in `node_modules`, and the package is type-checked with plain `tsc`.
5. **`runtime/shared/` stays pure**: no Nuxt, Nitro, Vue or Node imports, so the browser and the server can both use it. It may import the pure helpers of `@mapomodule/utils` and, by subpath, the form's schema reader and writer (`@mapomodule/form/runtime/composables/useFormFromSchema`, `@mapomodule/form/runtime/utils/fieldsToJsonSchema`).
6. **Secrets stay on the server.** Keys and secrets go in the private `runtimeConfig`, never in `runtimeConfig.public`, a response, a log or an audit record. They are set at runtime, from the environment (`NUXT_MAPO_AI_SECRET`): a value written in the Nuxt config is copied into the server bundle, and the module warns about it.
7. **Outside data is `unknown`** until a validator turns it into a typed value: request bodies, provider responses, files, rendered HTML and stored records. Never cast it with `as`. A provider's answer goes through `sanitize.ts`, which reads it property by property and never throws on it: what it cannot use is empty, discarded with a reason, or a warning.
8. **Nothing that keeps the AI out may be lost.** A secret, a read-only value, an exclusion or a media type counts wherever a schema writes it: beside a union, in one of its branches, behind a `$ref`, on an object around a dotted key (even when the path stops before the value), in a part of the schema the form's reader cannot read, inside the items of a list, in every declaration of a nested value on either side, on a part of a point (`place.lat`). The reader resolves for display and drops some of these; `entity.ts` looks through every variant, reads an unreadable schema property by property, and asks the schemas around a nested value for every path inside it (`speakers.*.pin`). A key names a secret with the keys around it (`api.key`). A new keyword of this kind gets a regression test on both sides of the merge.
9. **One schema for every provider.** The contract's schema stays in the subset that every provider accepts in strict mode: objects with every key in `required` and `additionalProperties: false`, strings, arrays, string `enum`s, at most one `anyOf` and never at the root; no `null`, no numeric or length limits, no formats; at most 250 values in one `enum`, 1000 in all; at most 5000 properties, 10 levels of nesting (every schema on the way, the root and the leaf included: a list that would go deeper is left out, in `omitted`) and 100,000 characters of property names and enum values; property names of letters, digits and `_`, up to 64 characters. A value the source does not give is `""` or an empty list. What the schema cannot say goes in the property's description, and the sanitizer applies it. The compiler measures the schema it builds and moves lists to the descriptions until it fits, or throws. `expectPortable()` in `__tests__/portable.ts` checks the subset: a new keyword needs the current docs of every provider first.
10. **Every action is an operation.** What the UI does is also callable without the UI, with typed input and output and its dependencies passed in. Writes to the backend always need the operator's confirmation; the gateway itself never writes to the backend.
11. **The state is sealed, and fails closed.** What the gateway keeps goes through `useMapoAiStorage(event)`, never `useStorage()` directly. Without a usable secret or a mount the storage is closed: no clear text, no memory of one process. A record that does not open is never deleted: only its expiry or a new value removes it. Stored values are outside data (rule 7): read them with a validator.
12. **Every route starts with the session.** A handler calls `requireMapoAiSession(event)`, or `requireMapoAiAdmin(event)`, before it reads anything else, and sets `Cache-Control: no-store` when the answer is the user's own; only a route that tells the user what they may do, as `status`, uses `readMapoAiCaller(event)` and answers a refused user (`allowed: false`) instead of a 403. The gateway keeps no session of its own: it forwards the request's `cookie`, and no other header, to `userInfoApi` by Nitro's local fetch, as core restores the session. A backend that cannot say who is signed in gets a 502, never a 401. A rule that cannot be read picks fewer users, never more; an app narrows access with the `mapo-ai:user` hook, which can only refuse: its `allowed` is a latch, so a later hook never undoes an earlier refusal. Permissions are read by `userPermissions()` of `@mapomodule/utils`, as the auth store reads them.
13. **No pattern runs unbounded.** A field's patterns come from the schemas, which may come from outside: the sanitizer runs one only when `patterns.ts` bounds its work on the value, and a value whose pattern could not be tested (too costly, unreadable, or failing while it runs) is kept and never verified. A new way of testing values against an outside expression gets the same bound.
14. **`run` builds what it asks, and spends last.** The gateway compiles the contract itself from the descriptions the page sends (`run/contract.ts`), never from a contract a client sends, so the rules a contract holds inside hold by construction; zod reads only the envelope. The order in `runMapoAi()` keeps the cost for last: provider, model, permission and the user's limit (looked at, not counted) come before the contract and the hooks, and the limit counts a call only once they have passed; without the storage no call is made. A provider is called only when `mapo.ai.providers` enables it, gets copies of what it is asked, and its answer is outside data, read as plain JSON; the call is audited as soon as it answers, before its answer is read. The prompt is composed in the gateway: what the server holds (Mapo's base rules, the app's, the admin's) comes before what the request writes, and an app's rules and hooks add, never remove. The audit holds metadata only, never the source, the instructions or the values. An option of `run` that cannot be read never widens what may spend: a provider is not enabled, a limit is `0`.
15. **The page writes only what the answer verifies on an empty field it shows, as the form writes, and undoes only its own.** `useMapoAiFill()` reads the answer of `run` as outside data (`readMapoAiFillResponse()`), and writes by itself only a value whose action is `apply`: verified, on a field that holds nothing and that the form shows. Everything else waits for the operator, marked at the field's value path, where the form looks. It writes only the keys the form's fields declare, through own properties and never through a segment that leads to a prototype, and as `useMapoForm()` writes: the field's accessor, every language of a `synci18n` field, `onChange`; keep the two in step. `restore()` and `undo()` put back only what still holds the AI's value, removing the keys and objects it added, and it removes only its own marks. The fields, the language and `isNew` are read after the `OPTIONS`. A related record is never written before someone finds it. Labels come from `mapo.ai.*`, and the shared `mapo.apply` and `mapo.restore`, in both catalogs of `@mapomodule/i18n`.

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
| An option of `run`               | `run/options.ts` and its warnings, `MapoAiOptions` in `index.ts`, `module.test.ts`, the docs' options           |
| The body or the answer of `run`  | `run/request.ts` (zod), `shared/gateway.ts` (types), the reader in `shared/fill.ts`, `run.test.ts`, the docs    |
| A base rule of the prompt        | `prompts/base.ts` and `MAPO_AI_PROMPT_VERSION`, `prompts.test.ts`                                               |
| A failure of a provider          | `MapoAiProviderFailure`, `FAILURES` in `run/run.ts`, the audit's validator, the errors in the docs              |
| A provider of Mapo               | `MAPO_PROVIDERS` and the reserved ids in `providers/registry.ts`, its options in `run/options.ts`               |
| The sealed record's format       | `ENVELOPE_VERSION` in `storage/sealed.ts`, keeping the previous format readable; the storage tests              |
| What goes into a form by itself  | `actionOf()` and `isEmptyFormValue()` in `fill.ts`, `fill.test.ts`, the table of the docs' "Fill a detail form" |
| A mark or a message of the fill  | `mapo.ai.fill.*`, `mapo.ai.errors.*` in both `mapo.{en,it}.json` of `@mapomodule/i18n`; `useMapoAiFill.test.ts` |
| How the form writes a value      | `writeField()` of `useMapoAiFill.ts`, which repeats `setFieldValue()` of the form's `useMapoForm.ts`            |

## Verify

```bash
pnpm --filter "@mapomodule/ai..." build   # ai and what it depends on: the tests run the form's built reader
pnpm --filter @mapomodule/ai test
pnpm --filter @mapomodule/ai typecheck
pnpm --filter @mapomodule/ai lint
```

Live: `apps/example-e2e` sets `mapo.ai`, so the gateway answers while `pnpm dev:example-e2e` runs: `curl http://localhost:3000/_mapo/ai/status` gets a 401, and with the mock API's session cookie, `-H 'cookie: __mapo_session=admin'` (a superuser) or `__mapo_session=editor`, the user's status. `run` calls the mock, which the app enables: post `{"task":"fill","entity":{"fields":{…}},"parts":[{"kind":"text","text":"Title: About us"}]}` with `content-type: application/json` and the same cookie, and add `#mock:refusal` or `#mock:rate-limit` to the text for its failures. Without `NUXT_MAPO_AI_SECRET` the dev server warns that it seals with a temporary secret, and the state, the audit records of `run` included, goes to `apps/example-e2e/.data/mapo-ai`. Stop the dev server afterwards.

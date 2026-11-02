# AGENTS.md — `@mapomodule/ai`

Local rules for the AI-assisted data entry package. The root [`AGENTS.md`](../../../AGENTS.md) still applies; the public page is [`docs/modules/ai.md`](../../../docs/modules/ai.md).

## What this package is

An experimental, opt-in Nuxt module. The meta-module installs it only when the app sets `mapo.ai`; registered on its own it reads `mapoAi`. Today it registers the **AI gateway** on the app's Nitro server, under `/_mapo/ai/*`, and the gateway answers `GET status` with the version of its contract.

## Layout

```text
src/
  module.ts                  Nuxt module: registers the gateway routes with addServerHandler
  index.ts                   public types (MapoAiOptions, MapoAiStatus), also re-exported by mapomodule/types
  runtime/shared/            pure TypeScript shared by the module, the server and the browser:
                               gateway.ts  route prefix, contract version, response shapes
                               dialect.ts  the `x-mapo-ai` keyword (hint, exclude) of the JSON Schema dialect
                               entity.ts   the entity model: what the AI may fill, built from the backend schema
                                           and the form's fields, with skipped fields and warnings
                               contract.ts what the AI is asked to return (fill, extract): the strict schema of the
                                           answer, in the subset every provider accepts, and the fields behind it
                               guards.ts   type guards for outside values
  runtime/server/routes/     Nitro handlers, one file per route
  __tests__/                 Vitest; gateway routes are tested on a bare h3 app
```

## Rules

1. **Opt-in, nothing loaded otherwise.** An app without `mapo.ai` must not get a route, a plugin, a component or a dependency loaded from this package. Keep the check in `packages/mapomodule/src/module.ts`.
2. **Options arrive with their behaviour.** An option is added in the change that makes it do something, with a default, JSDoc and a row in `docs/modules/ai.md`. No option is documented before it works.
3. **Gateway routes live under `/_mapo/ai/`**, never under `/api/*`, where backend integrations proxy to the real backend. The prefix and the gateway's version (`MAPO_AI_CONTRACT_VERSION`) are in `runtime/shared/gateway.ts`; raise it when a route, a body or a response changes in a way an older client cannot read. The format of a task contract has its own version, `AI_CONTRACT_FORMAT_VERSION` in `contract.ts`; a change to it that the gateway reads raises both.
4. **Server code imports explicitly**: `h3` for handlers and helpers (a dependency), `nitropack/runtime` for runtime config and storage (`nitropack` goes in devDependencies, for its types). Never `#imports`: auto-imports do not run in `node_modules`, and the package is type-checked with plain `tsc`.
5. **`runtime/shared/` stays pure**: no Nuxt, Nitro, Vue or Node imports, so the browser and the server can both use it. It may import the pure helpers of `@mapomodule/utils` and, by subpath, the form's schema reader and writer (`@mapomodule/form/runtime/composables/useFormFromSchema`, `@mapomodule/form/runtime/utils/fieldsToJsonSchema`).
6. **Secrets stay on the server.** Keys and secrets go in the private `runtimeConfig`, never in `runtimeConfig.public`, a response, a log or an audit record.
7. **Outside data is `unknown`** until a validator turns it into a typed value: request bodies, provider responses, files, rendered HTML and stored records. Never cast it with `as`.
8. **Nothing that keeps the AI out may be lost.** A secret, a read-only value, an exclusion or a media type counts wherever a schema writes it: beside a union, in one of its branches, behind a `$ref`, on an object around a dotted key (even when the path stops before the value), in a part of the schema the form's reader cannot read. The reader resolves for display and drops some of these; `entity.ts` looks through every variant and reads an unreadable schema property by property. A new keyword of this kind gets a regression test on both sides of the merge.
9. **One schema for every provider.** The contract's schema stays in the subset that every provider accepts in strict mode: objects with every key in `required` and `additionalProperties: false`, strings, arrays, string `enum`s, at most one `anyOf` and never at the root; no `null`, no numeric or length limits, no formats; at most 250 values in one `enum`, 1000 in all; at most 5000 properties, 10 levels of nesting and 100,000 characters of property names and enum values; property names of letters, digits and `_`, up to 64 characters. A value the source does not give is `""` or an empty list. What the schema cannot say goes in the property's description, and the sanitizer applies it. The compiler measures the schema it builds and moves lists to the descriptions until it fits, or throws. `expectPortable()` in `contract.test.ts` checks the subset: a new keyword needs the current docs of every provider first.
10. **Every action is an operation.** What the UI does is also callable without the UI, with typed input and output and its dependencies passed in. Writes to the backend always need the operator's confirmation; the gateway itself never writes to the backend.

## Change together

| You change                       | Also change                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| A route or its response          | `runtime/shared/gateway.ts` (types, `MAPO_AI_CONTRACT_VERSION`), routes in `docs/modules/ai.md`  |
| An option                        | Its default in `module.ts`, `docs/modules/ai.md`, `README.md` if the installation changes        |
| How the meta-module installs it  | `packages/mapomodule/src/module.ts`, `docs/guide/concepts.md`, `packages/mapomodule/README.md`   |
| What the package does, in a line | `docs/guide/concepts.md`, `docs/guide/feature-status.md`, `mcp/src/runtime/core/instructions.ts` |
| A value kind or a skip reason    | `entity.ts`; `contract.ts` (`KIND_RULES`, `PROSE_KINDS`); the tables of both test files          |
| The contract's shape             | `AI_CONTRACT_FORMAT_VERSION` (and the gateway's when it reads it), `expectPortable()`            |

## Verify

```bash
pnpm --filter "@mapomodule/ai..." build   # ai and what it depends on: the tests run the form's built reader
pnpm --filter @mapomodule/ai test
pnpm --filter @mapomodule/ai typecheck
pnpm --filter @mapomodule/ai lint
```

Live: `apps/example-e2e` sets `mapo.ai`, so `curl http://localhost:3000/_mapo/ai/status` answers while `pnpm dev:example-e2e` runs. Stop the dev server afterwards.

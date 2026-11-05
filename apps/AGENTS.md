# AGENTS.md — `apps/`

Local rules for the demo and reference apps. The root [`AGENTS.md`](../AGENTS.md) still applies. The apps are private workspace packages: they are never released, and they consume the packages through `workspace:*`.

## The apps

| App                   | Port | Backend                              | Use it for                                                                 |
| --------------------- | ---- | ------------------------------------ | -------------------------------------------------------------------------- |
| `example-e2e`         | 3000 | In-memory mock in `server/api/**`    | The reference app: one page per scenario, the live check, the MCP test bed |
| `example`             | 3000 | A real Camomilla instance on `:8000` | The core demo with the published `@mapomodule/mapo-integrations-camomilla` |
| `example-theme`       | 3001 | None                                 | Theming layers, layout slots, MapoOverride                                 |
| `example-custom-form` | 3001 | Mock routes in `server/`             | Replacing the field registry with Vuetify components                       |

Agents run live checks in `example-e2e` only (`pnpm dev:example-e2e`), and stop the server afterwards. `example` needs a backend that is not part of this repository.

## `example-e2e`

- **Accounts**: `admin`, `editor` and `viewer`, password equal to the username (`server/utils/session.ts`).
- **Pages**: one per scenario under `app/pages/` (auth, permissions, roles, `form/*`, `list/*`, `media/*`, `menu/*`, `ai/*`, i18n, feedback, sidebar). The sidebar is built from each page's `definePageMeta`, so a new page needs no menu configuration.
- **AI**: `mapo.ai` in `nuxt.config.ts` enables the mock provider; `server/plugins/mapo-ai-fixtures.ts` registers its answers and `server/plugins/mapo-ai-rules.ts` the app's rules (the `viewer` account kept out, a rule of the prompt); `shared/aiArticleSamples.ts` holds the sources the `/ai/fill` page sends. The AI lab, `/ai/ollama/[id]`, fills the same article with a local model: it is off unless the dev server starts with `EXAMPLE_OLLAMA_MODELS` (`gemma4:12b,qwen3.8:27b`), which enables Mapo's `ollama` provider and the app's own (`server/plugins/mapo-ai-ollama.ts`), to compare them; the app's provider traces each call in the terminal (`[ai-lab]` lines) and for the page (`/_ai-lab/trace`, superusers only, outside `/api` and `/_mapo/ai`), and `EXAMPLE_OLLAMA_URL` points both at another Ollama. `/ai/ollama/blocks/[id]` runs the same lab on a complex form, a page of blocks on `/api/pages` (`app/utils/aiPageForm.ts`, sources in `shared/aiPageSamples.ts`), with the app's custom field types `stars` and `country` (`app/plugins/form-fields.ts`). The cloud lab, `/ai/cloud/[id]` and `/ai/cloud/blocks/[id]`, fills the same two forms with Mapo's `openai` and `anthropic` providers: each is on only when the dev server has its key (`NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`), whose presence alone `nuxt.config.ts` reads, and every call costs money; the panel (`AiCloudPanel.vue`) shows the time, the tokens with the prompt cache's share, the model that answered and an estimate of the cost from `shared/aiCloudPrices.ts`. Both labs list the outcomes with `AiLabOutcomes.vue`.
- **Mock API**: `server/api/**` with in-memory stores in `server/utils/`. It resets when the server restarts.
- **`api-schema.json`** describes that mock API the way drf-spectacular would, for `mapo_backend_schema`. When an endpoint or a payload in `server/api/**` changes, update it in the same change.
- **`devtools.componentInspector` is off** on purpose: its tracer injects an import that does not resolve under pnpm's isolated layout and breaks the dev server.
- **A new page 404s** until the dev server restarts.

## Rules

1. **Apps show the documented way.** Code here is copied by people and read by assistants as an example: use the public APIs exactly as the docs describe them, with no private imports from package internals.
2. **A new package feature gets a scenario** in `example-e2e` (a page or a section of one), so it can be checked live.
3. **No secrets.** Apps read backend settings from `nuxt.config.ts`; never commit `.env` values.
4. **Type-check the app you change**: the root `pnpm typecheck` covers the packages, not the apps.

   ```bash
   cd apps/example-e2e
   npx nuxt prepare
   npx vue-tsc --noEmit -p .nuxt/tsconfig.app.json
   ```

## Gotchas

- **A workspace package change does not show up** → the package was not rebuilt, or is not in stub mode (`pnpm dev:packages`); then run `pnpm nuxt prepare` in the app.
- **`apps/example` fails to log in** → no Camomilla backend on `:8000`.
- **`[nuxt-i18n]` warns that `mapo-i18n.config.mjs` is not found** → known build notice, printed by every app.

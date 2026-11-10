# AGENTS.md — `apps/`

Local rules for the demo and reference apps. The root [`AGENTS.md`](../AGENTS.md) still applies. The apps are private workspace packages: they are never released, and they consume the packages through `workspace:*`.

## The apps

| App                   | Port | Backend                              | Use it for                                                                 |
| --------------------- | ---- | ------------------------------------ | -------------------------------------------------------------------------- |
| `example-e2e`         | 3000 | In-memory mock in `server/api/**`    | The reference app: one page per scenario, the live check, the MCP test bed |
| `example-ai`          | 3002 | In-memory mock in `server/api/**`    | The AI module as a project enables it: AI settings, status, Magic Fill     |
| `example`             | 3000 | A real Camomilla instance on `:8000` | The core demo with the published `@mapomodule/mapo-integrations-camomilla` |
| `example-theme`       | 3001 | None                                 | Theming layers, layout slots, MapoOverride                                 |
| `example-custom-form` | 3001 | Mock routes in `server/`             | Replacing the field registry with Vuetify components                       |

Agents run live checks in `example-e2e` (`pnpm dev:example-e2e`), and in `example-ai` (`pnpm dev:example-ai`) for the AI settings page, and stop the server afterwards. `example` needs a backend that is not part of this repository.

## `example-e2e`

- **Accounts**: `admin`, `editor`, `writer` and `viewer`, password equal to the username (`server/utils/session.ts`); `writer` is in two groups, `editors` and `reporters`.
- **Pages**: one per scenario under `app/pages/` (auth, permissions, roles, `form/*`, `list/*`, `media/*`, `menu/*`, `ai/*`, i18n, feedback, sidebar). The sidebar is built from each page's `definePageMeta`, so a new page needs no menu configuration.
- **AI**: `mapo.ai` in `nuxt.config.ts` enables the mock provider; `server/plugins/mapo-ai-fixtures.ts` registers its answers and `server/plugins/mapo-ai-rules.ts` the app's rules (the `viewer` account kept out, a rule of the prompt); `shared/aiArticleSamples.ts` holds the sources the `/ai/fill` page sends. `/ai/magic-fill/[id]` is the same article with Magic Fill, which the module adds to every `MapoDetail`: the page registers nothing, lists the samples to paste in the panel (on `/ai/magic-fill/1`, Update shows the preview of the values that would replace the article's), and keeps drafts, so a reload and Restore bring back the session; `/ai/magic-fill-off/[id]` is the same article on a page that turns it off with `definePageMeta({ magicFill: false })`, and `/ai/magic-fill-reveal/[id]` one whose excerpt shows only once the article has a status, so the answer itself reveals it; the other AI pages, which have a panel of their own, show only theirs with the `extensions` prop of `MapoDetail`, and so does `/form/detail-context`. The AI lab, `/ai/ollama/[id]`, fills the same article with a local model: it is off unless the dev server starts with `EXAMPLE_OLLAMA_MODELS` (`gemma4:12b,qwen3.8:27b`), which enables Mapo's `ollama` provider and the app's own (`server/plugins/mapo-ai-ollama.ts`), to compare them; the app's provider traces each call in the terminal (`[ai-lab]` lines) and for the page (`/_ai-lab/trace`, superusers only, outside `/api` and `/_mapo/ai`), and `EXAMPLE_OLLAMA_URL` points both at another Ollama. `/ai/ollama/blocks/[id]` runs the same lab on a complex form, a page of blocks on `/api/pages` (`app/utils/aiPageForm.ts`, sources in `shared/aiPageSamples.ts`), with the app's custom field types `stars` and `country` (`app/plugins/form-fields.ts`). The cloud lab, `/ai/cloud/[id]` and `/ai/cloud/blocks/[id]`, fills the same two forms with Mapo's `openai` and `anthropic` providers: each is on only when the dev server has its key (`NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`), whose presence alone `nuxt.config.ts` reads, and every call costs money; the panel (`AiCloudPanel.vue`) shows the time, the tokens with the prompt cache's share, the model that answered and an estimate of the cost from `shared/aiCloudPrices.ts`. Both labs list the outcomes with `AiLabOutcomes.vue`. The three panels (`AiFillPanel.vue` for `/ai/fill`, `AiOllamaPanel.vue` and `AiCloudPanel.vue` for the labs) also take a file, through `AiSourceFile.vue`: it sends the file with `useMapoAiRead()`, builds the `accept` of its input from the `readers` of `status`, puts the text read into the panel's box, and offers the samples in `public/ai-files/` (Markdown, a web page, CSV, Excel and a calendar event); until the operator edits the box, `run` gets the file's parts, named after it, instead of the box's text. `server/plugins/mapo-ai-readers.ts` registers the app's reader of calendar events (`.ics`) and a `mapo-ai:read` hook that takes the lines starting with `Internal:` out of every file, which the Markdown sample shows. The keys lab, `/ai/keys`, shows how the gateway chooses the key of a call: each account sees where its key comes from and saves its own token where an assignment allows it, the admin assigns keys and models to everyone, a group or a user and orders the groups, and a call goes to the app's provider `example-keys` (`server/plugins/mapo-ai-keys.ts`), which calls no model and names the key it got by its last four characters; its project's key, if any, is `NUXT_MAPO_AI_PROVIDERS_EXAMPLE_KEYS_API_KEY`.
- **Mock API**: `server/api/**` with in-memory stores in `server/utils/`. It resets when the server restarts.
- **`api-schema.json`** describes that mock API the way drf-spectacular would, for `mapo_backend_schema`. When an endpoint or a payload in `server/api/**` changes, update it in the same change.
- **`devtools.componentInspector` is off** on purpose: its tracer injects an import that does not resolve under pnpm's isolated layout and breaks the dev server.
- **A new page 404s** until the dev server restarts.

## `example-ai`

- **What it is**: an app that enables `@mapomodule/ai` as a real project does, and nothing else. `mapo.ai` in `nuxt.config.ts` installs the module and with it the AI settings page (`/ai-settings`, in the sidebar's footer); `app/pages/index.vue` shows `GET /_mapo/ai/status` (providers, models, where each key comes from, the default, the user's preference, the limits, the storage), and `app/pages/articles/` lists and edits the articles of the app's backend (`server/api/articles`, DRF-like, with `OPTIONS`), where Magic Fill fills an article with the providers the app enables; the article keeps drafts, so a reload and Restore bring back Magic Fill's session without a new call.
- **Providers**: Mapo's `openai` and `anthropic`, always on, with no mock: a provider without a key says so. Their keys come from the server's environment (`apps/example-ai/.env`, gitignored) or from the keys the `admin` account assigns on the settings page. `EXAMPLE_OLLAMA_MODELS` also enables `ollama`. Both cloud providers set `adminModels: true`, so the admin can add a model in "How the AI works". Checking the connection, and adding a model, lists a provider's models at no cost; a call to a model costs money: Magic Fill on an article makes one at each Extract, and the usage shows it. `mapo.ai.prices` holds the list prices of the models, for the costs of the usage.
- **Accounts**: `admin` (a superuser, so an admin of the AI), `editor` (group `editors`), `writer` (`editors` and `reporters`) and `viewer` (no group), password equal to the username (`server/utils/session.ts`); on articles `editor` does everything, `writer` adds and changes, `viewer` only reads, so gets no Magic Fill; in development `app/components/DevUserSwitcher.vue`, in the topbar, signs in as another one in one click through `useMapoAuth().login()`. `server/api/users` and `server/api/groups` list them as a DRF backend would, for `mapo.ai.settings.usersApi` and `groupsApi`.
- **The secret**: without `NUXT_MAPO_AI_SECRET` the dev server seals with a temporary secret, and after a restart the admins' keys sealed with the old one close the AI with a 503 until `.data/mapo-ai` is removed.
- `example-e2e` turns the settings page off (`mapo.ai.settings.path: false`) and keeps its keys lab, `/ai/keys`.

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

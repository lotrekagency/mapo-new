# @mapomodule/example-ai

The AI demo of Mapo v2: an app that turns on `@mapomodule/ai` the way a real project does, with a page for each thing the module does. Setting `mapo.ai` in `nuxt.config.ts` installs the module, and with it the AI settings page and Magic Fill on every detail page; the app adds a tour, the AI status, three entities to fill (articles, pages made of blocks, events), an import of several events from one source, and the server code a project writes for the AI. It runs on a small in-memory mock backend, without a real one.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build                # once after cloning
pnpm dev:example-ai       # http://localhost:3002
```

Log in as `admin` / `admin`, a superuser and so an admin of the AI, and start from **Tour** in the sidebar. The other accounts have the password equal to the username (`server/utils/session.ts`):

| Account      | Groups                 | On articles, pages, events | The AI                                                                          |
| ------------ | ---------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `admin`      | `admin` (a superuser)  | everything                 | uses it and administers it                                                      |
| `editor`     | `editors`              | everything                 | uses it                                                                         |
| `writer`     | `editors`, `reporters` | adds and changes           | uses it                                                                         |
| `viewer`     | none                   | reads                      | kept out: `mapo.ai.users` names no group of theirs                              |
| `contractor` | `editors`              | adds and changes           | kept out: the backend marks the account external, and the app's hook refuses it |

In development, the selector at the top right signs in as another account in one click (`app/components/DevUserSwitcher.vue`); to see two accounts at once, use a private window or another browser, since the session is one cookie per address.

## Pages

| Route                          | What it shows                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/tour`                        | Every stop of the tour, from the simplest to the most complex, with the files to attach and the texts to paste                                                                                                                     |
| `/`                            | The AI status (`GET /_mapo/ai/status`, the app's own page): the providers and models offered to the account, where each key comes from, the user's token, what a request that names nothing calls, the limits, the storage         |
| `/ai-settings`                 | The module's AI settings page, in the sidebar's footer: each user picks a provider and a model, saves their own token where allowed and checks the connection; the admins assign keys, change how the AI works and read the usage  |
| `/articles`                    | Articles with sources, a category (five, listed for the AI), tags (sixty, searched by name) and a date shown once published: Magic Fill fills them, and keeps drafts                                                               |
| `/articles/no-magic-fill/[id]` | The same article on a page that turns Magic Fill off (`definePageMeta({ magicFill: false })`)                                                                                                                                      |
| `/articles/no-quotes/[id]`     | The same article, with Magic Fill asking for no quotes (`magicFill: { evidence: false }`): every value waits for the operator                                                                                                      |
| `/articles/own-panel/[id]`     | The same article, filled by a panel of the app's own (`app/components/ArticleAiPanel.vue`) built on `useMapoAiFill()` and `useMapoAiRead()`, instead of Magic Fill                                                                 |
| `/pages`                       | Pages made of blocks with six templates: Magic Fill gives each block to choose, and adds the chosen ones after the page's own                                                                                                      |
| `/events`                      | Events on a large form (`app/utils/eventForm.ts`): tabs, groups that start closed, translations, a nested object, a venue listed for the AI, speakers searched by name, a contact found by email, and the fields the AI never gets |
| `/events/import`               | Every event of a programme, found with one call of `run` and its task `extract`, created as drafts once the operator ticks them and confirms                                                                                       |

The files to attach are in `public/ai-files/`: an article in Markdown (with a line the app keeps from the AI), HTML, CSV and Excel; an event in iCalendar, which the app reads itself, and in JSON; two programmes to import, in CSV and HTML.

## The app's code for the AI

- `nuxt.config.ts`: `mapo.ai`, with the providers, who may use the AI (`users`), the app's rules for every prompt (`instructions`), the prices of the models for the usage, and the settings page's endpoints; `mapo.form.groups.expanded: false`, so the event's groups start closed.
- `server/plugins/mapo-ai-rules.ts`: the `mapo-ai:user` hook keeps out the accounts the backend marks external; the `mapo-ai:prompt` hook adds a rule for events.
- `server/plugins/mapo-ai-readers.ts`: a reader of calendar events (`registerMapoAiReader()`), and the `mapo-ai:read` hook, which takes the lines starting with `Internal:` out of every file.
- The forms' `ai` options: a hint for the event's summary, the slug and the internal notes kept from the AI, the contact never listed for it (`app/utils/eventForm.ts`).

## The providers

The app enables Mapo's `openai` and `anthropic` providers, as a project does. Each needs a key, which comes from the server's environment or from the settings page, never from `nuxt.config.ts`:

- the project's keys, in `apps/example-ai/.env`, which git ignores: `NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`;
- or no project's key: sign in as `admin` and assign one on the settings page, to everyone, a group or a user.

Both set `adminModels: true`, so the admin can add a model the provider's server lists, in the settings page's "How the AI works", where the admins also change the AI's instructions, rules of verification, secret fields, prompt cache and Anthropic's fallbacks. The app also writes the list prices of these models (`mapo.ai.prices`), so the settings page shows the cost of the usage beside its tokens. Without any key, the status page says that `run` refuses the provider. Checking the connection lists the provider's models with the key the account gets, which costs nothing. Magic Fill calls the model at each Extract, and the import at each search: that costs money, and the usage on the settings page shows it.

Two local servers of models cost nothing:

- `EXAMPLE_OLLAMA_MODELS` (`gemma4:12b,qwen3.8:27b`) enables Mapo's `ollama` provider with those models, at `http://localhost:11434` unless `NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL` says otherwise;
- `EXAMPLE_OPENAI_COMPATIBLE_MODELS` enables Mapo's `openai-compatible` provider with those models, at LM Studio's `http://localhost:1234/v1` unless `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_BASE_URL` says otherwise (vLLM, the server of llama.cpp).

## The secret

The keys, the tokens and the preferences are sealed in the AI's storage (`.data/mapo-ai`) with `NUXT_MAPO_AI_SECRET`. Without it the dev server seals with a temporary secret, so what was saved does not open after a restart, and the admins' keys that do not open close the AI with a 503 until `.data/mapo-ai` is removed: set one in `apps/example-ai/.env` (`openssl rand -hex 32`).

## See also

- [`docs/modules/ai.md`](../../docs/modules/ai.md): the AI module, its settings page and its keys
- [`docs/howto/magic-fill.md`](../../docs/howto/magic-fill.md): Magic Fill, for the operator and for the developer
- [`apps/example-e2e/`](../example-e2e/): the reference app, whose AI pages fill forms with the mock provider and with real models

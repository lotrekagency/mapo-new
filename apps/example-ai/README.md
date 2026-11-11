# @mapomodule/example-ai

The AI demo of Mapo v2: an app that turns on `@mapomodule/ai` the way a real project does, and nothing else. Setting `mapo.ai` in `nuxt.config.ts` installs the module, and with it the AI settings page and Magic Fill on every detail page; the app adds the AI status and two small entities to fill: the articles, with a list of sources, and the pages, made of blocks. It runs on a small in-memory mock backend, without a real one.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build                # once after cloning
pnpm dev:example-ai       # http://localhost:3002
```

Log in as `admin` / `admin`, a superuser and so an admin of the AI. The `editor`, `writer` and `viewer` accounts (password equal to the username) are plain users: `editor` is in the group `editors`, `writer` in `editors` and `reporters`, `viewer` in none (`server/utils/session.ts`). On articles and pages, `editor` and `writer` add and change, so they get Magic Fill; `viewer` only reads. In development, the selector at the top right signs in as another account in one click (`app/components/DevUserSwitcher.vue`); to see two accounts at once, use a private window or another browser, since the session is one cookie per address.

## Pages

| Route          | What it shows                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | The AI status (`GET /_mapo/ai/status`, the app's own page): the providers and models offered to the account, where each key comes from, the user's token, what a request that names nothing calls, the limits, the storage |
| `/ai-settings` | The module's AI settings page, in the sidebar's footer: each user picks a provider and a model, saves their own token where allowed and checks the connection; the admins assign keys to everyone, a group or a user       |
| `/articles`    | The articles of the mock backend (`server/api/articles`), with sources, a category (five, `server/api/categories`), tags (sixty, searched, `server/api/tags`) and a date shown once published: Magic Fill fills them       |
| `/pages`       | The pages of the mock backend (`server/api/pages`), made of blocks with six templates: Magic Fill gives each block to choose, and adds the chosen ones after the page's own                                                |

## The providers

The app enables Mapo's `openai` and `anthropic` providers, as a project does. Each needs a key, which comes from the server's environment or from the settings page, never from `nuxt.config.ts`:

- the project's keys, in `apps/example-ai/.env`, which git ignores: `NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`;
- or no project's key: sign in as `admin` and assign one on the settings page, to everyone, a group or a user.

Both set `adminModels: true`, so the admin can add a model the provider's server lists, in the settings page's "How the AI works", where the admins also change the AI's instructions, rules of verification, secret fields, prompt cache and Anthropic's fallbacks. The app also writes the list prices of these models (`mapo.ai.prices`), so the settings page shows the cost of the usage beside its tokens. Without any key, the status page says that `run` refuses the provider. Checking the connection lists the provider's models with the key the account gets, which costs nothing. Magic Fill on an article calls the model at each Extract, and that costs money: the usage on the settings page shows it.

`EXAMPLE_OLLAMA_MODELS` (`gemma4:12b,qwen3.8:27b`) also enables Mapo's `ollama` provider with those models, at `http://localhost:11434` unless `NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL` says otherwise.

## The secret

The keys, the tokens and the preferences are sealed in the AI's storage (`.data/mapo-ai`) with `NUXT_MAPO_AI_SECRET`. Without it the dev server seals with a temporary secret, so what was saved does not open after a restart, and the admins' keys that do not open close the AI with a 503 until `.data/mapo-ai` is removed: set one in `apps/example-ai/.env` (`openssl rand -hex 32`).

## See also

- [`docs/modules/ai.md`](../../docs/modules/ai.md): the AI module, its settings page and its keys
- [`apps/example-e2e/`](../example-e2e/): the reference app, whose AI pages fill forms with the mock provider and with real models

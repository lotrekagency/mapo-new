# @mapomodule/example-ai

The AI demo of Mapo v2: an app that turns on `@mapomodule/ai` the way a real project does, and nothing else. Setting `mapo.ai` in `nuxt.config.ts` installs the module, and with it the AI settings page; the app adds one page of its own, the AI status. It runs on a small in-memory mock backend, without a real one.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build                # once after cloning
pnpm dev:example-ai       # http://localhost:3002
```

Log in as `admin` / `admin`, a superuser and so an admin of the AI. The `editor`, `writer` and `viewer` accounts (password equal to the username) are plain users: `editor` is in the group `editors`, `writer` in `editors` and `reporters`, `viewer` in none (`server/utils/session.ts`).

## Pages

| Route          | What it shows                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | The AI status (`GET /_mapo/ai/status`, the app's own page): the providers and models offered to the account, where each key comes from, the user's token, what a request that names nothing calls, the limits, the storage |
| `/ai-settings` | The module's AI settings page, in the sidebar's footer: each user picks a provider and a model, saves their own token where allowed and checks the connection; the admins assign keys to everyone, a group or a user       |

## The providers

The app enables Mapo's `openai` and `anthropic` providers, as a project does. Each needs a key, which comes from the server's environment or from the settings page, never from `nuxt.config.ts`:

- the project's keys, in `apps/example-ai/.env`, which git ignores: `NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`;
- or no project's key: sign in as `admin` and assign one on the settings page, to everyone, a group or a user.

Without any key, the status page says that `run` refuses the provider. Checking the connection lists the provider's models with the key the account gets, which costs nothing; this app makes no other call.

`EXAMPLE_OLLAMA_MODELS` (`gemma4:12b,qwen3.8:27b`) also enables Mapo's `ollama` provider with those models, at `http://localhost:11434` unless `NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL` says otherwise.

## The secret

The keys, the tokens and the preferences are sealed in the AI's storage (`.data/mapo-ai`) with `NUXT_MAPO_AI_SECRET`. Without it the dev server seals with a temporary secret, so what was saved does not open after a restart, and the admins' keys that do not open close the AI with a 503 until `.data/mapo-ai` is removed: set one in `apps/example-ai/.env` (`openssl rand -hex 32`).

## See also

- [`docs/modules/ai.md`](../../docs/modules/ai.md): the AI module, its settings page and its keys
- [`apps/example-e2e/`](../example-e2e/): the reference app, whose AI pages fill forms with the mock provider and with real models

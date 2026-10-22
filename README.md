# Mapo

Mapo v2 is a Nuxt 4 admin framework: a set of Nuxt modules that turn a REST backend into a backoffice declaratively. You describe endpoints, list columns, form fields and route permissions, and Mapo renders the list and detail pages, the forms, the login, the navigation, the media library and the menu editor.

It is built on Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS v4, Pinia and `@nuxtjs/i18n`, and follows Django REST Framework conventions.

**Documentation: <https://lotrekagency.github.io/mapo-new/>**. Start from [Concepts](https://lotrekagency.github.io/mapo-new/guide/concepts) and [Getting Started](https://lotrekagency.github.io/mapo-new/guide/getting-started).

## Use Mapo in an app

```bash
pnpm add mapomodule@next @nuxt/ui
```

```ts
// nuxt.config.ts — register @nuxt/ui before mapomodule
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],

  mapo: {
    // Every key is optional: these are the defaults.
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
    loginUrl: "/login",
  },
});
```

Mapo v2 is in beta and published on the `next` dist-tag. The `latest` tag still points to Mapo v1 (Nuxt 2), so a bare `pnpm add mapomodule` installs v1. [Getting Started](https://lotrekagency.github.io/mapo-new/guide/getting-started) continues with `app.vue`, the backend integration and the first page.

## Packages

| Package                                           | Role                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`mapomodule`](packages/mapomodule)               | Meta-module: reads the `mapo` config key and installs every package below (`@mapomodule/mcp` only in development)                                                  |
| [`@mapomodule/core`](packages/@mapomodule/core)   | Service layer: `$mapoFetch` with 401/403 handling, `useCrud`, `useMapoAuth`, the `auth`, `permissions` and `roles` route middleware, server-side session hydration |
| [`@mapomodule/store`](packages/@mapomodule/store) | Pinia stores (auth, snack, confirm, sidebar) and `usePermissions`                                                                                                  |
| [`@mapomodule/uikit`](packages/@mapomodule/uikit) | Admin shell (layouts, sidebar, topbar, login), `MapoList`, `MapoDetail`, media manager, menu manager, theming, MapoOverride                                        |
| [`@mapomodule/form`](packages/@mapomodule/form)   | Form engine: `FieldDescriptor[]`, the field registry, `MapoForm`, `useMapoForm()`, the JSON Schema bridge                                                          |
| [`@mapomodule/i18n`](packages/@mapomodule/i18n)   | `@nuxtjs/i18n` v10 wrapper with Mapo's English and Italian catalogs and `useMapoT()`                                                                               |
| [`@mapomodule/utils`](packages/@mapomodule/utils) | Plain TypeScript helpers (`deepMerge`, `objectDiff`, `slugify`, …): not a Nuxt module, imported explicitly                                                         |
| [`@mapomodule/mcp`](packages/@mapomodule/mcp)     | Development-only MCP server that gives AI assistants Mapo's docs, real component APIs and your app's configuration                                                 |

Backend integrations ship from their own repositories. [`@mapomodule/mapo-integrations-camomilla`](https://github.com/camomillacms/mapo-integrations-camomilla) proxies a [Camomilla CMS](https://github.com/lotrekagency/camomilla) backend; any other backend gets [its own small integration](https://lotrekagency.github.io/mapo-new/modules/integrations-howto).

## Working on this repository

### Requirements

- Node.js ^22.19 || ^24.11 || >=26. The `.nvmrc` pins 24: run `nvm use`.
- pnpm 8. `package.json` pins `pnpm@8.15.6` through `packageManager`.

### Setup

```bash
pnpm install
pnpm build
```

Run `pnpm build` once after cloning: the packages resolve each other from `dist/`, and the MCP server needs its generated knowledge base.

### Apps

| Script                   | App                                                    | Port | Backend                         | What it shows                                                                                  |
| ------------------------ | ------------------------------------------------------ | ---- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev:example-e2e`   | [`apps/example-e2e`](apps/example-e2e)                 | 3000 | In-memory mock API              | The reference app: one page per scenario, the MCP test bed. Log in as `admin` / `admin`        |
| `pnpm dev:example`       | [`apps/example`](apps/example)                         | 3000 | A Camomilla instance on `:8000` | The core demo, with the published Camomilla integration                                        |
| `pnpm dev:example-theme` | [`apps/example-theme`](apps/example-theme)             | 3001 | None                            | CSS tokens, Nuxt UI defaults, layout slots, MapoOverride, a custom field                       |
| `pnpm dev:example-form`  | [`apps/example-custom-form`](apps/example-custom-form) | 3001 | Mock routes in `server/`        | `core` and `form` without UIKit or Nuxt UI, with the field registry swapped for Vuetify fields |
| `pnpm docs:dev`          | `docs`                                                 | 5173 | —                               | The documentation site                                                                         |

### Package development

Switch the packages to stub mode while you work on them: `dist/` then re-exports from `src/`, so source changes need no rebuild.

| Script                                                                  | What it watches                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev:packages`                                                     | Every package at once, through Turborepo                           |
| `pnpm dev:core`, `dev:store`, `dev:uikit`, `dev:form`, `dev:mapomodule` | One Nuxt module package (`nuxt-module-build build --stub --watch`) |
| `pnpm dev:utils`                                                        | `@mapomodule/utils` (`tsc --watch`)                                |

`@mapomodule/i18n` and `@mapomodule/mcp` have no root alias: run `pnpm --filter @mapomodule/i18n dev`. After stubbing, regenerate the app's auto-import types with `pnpm nuxt prepare` inside the app.

A typical session uses two terminals:

```bash
# terminal 1: watch the package you are editing
pnpm dev:uikit

# terminal 2: run an app that uses it
pnpm dev:example-e2e
```

### Build, checks and tests

| Script                 | What it does                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`           | Builds every workspace package through Turborepo, in dependency order: the packages, the apps and the docs site     |
| `pnpm lint`            | ESLint over every package's `src/`                                                                                  |
| `pnpm typecheck`       | `tsc --noEmit` for the TypeScript packages, `vue-tsc --noEmit` for `form` and `uikit`; the apps are checked by hand |
| `pnpm test`            | Vitest in the packages that declare a `test` script: `utils`, `form` and `mcp`                                      |
| `pnpm exec vitest run` | Every test file in the repository, including `core`, `store` and `uikit`                                            |
| `pnpm docs:build`      | The documentation site                                                                                              |

Type declarations: `core`, `store` and `i18n` emit them with `tsc -p tsconfig.build-types.json`, and `utils` with plain `tsc`. `form` and `uikit` use `vue-tsc`, then `scripts/clean-empty-vue-dts.mjs` deletes the empty `.vue.d.ts` stubs that would collapse app types to `any`. The `mcp` build also generates its knowledge base from `docs/` and the `uikit` and `form` sources.

What to run before handing a change over, and how to check it in the reference app: [Testing and verification](docs/contributing/testing.md).

### Releases

Releases are cut by maintainers. The `CD` workflow is dispatched by hand from `beta` or another release branch, never from `main`, and runs [multi-semantic-release](https://github.com/qiwi/multi-semantic-release): each package is versioned from its [Conventional Commits](https://www.conventionalcommits.org/), published to npm (prereleases from `beta` on the `next` dist-tag) and announced on Slack.

| Script                  | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `pnpm release`          | Builds the packages and runs multi-semantic-release: what `CD` runs      |
| `pnpm release:dry`      | Previews the next versions and release notes without publishing anything |
| `pnpm publish:packages` | Emergency manual publish that bypasses semantic-release                  |

Pull requests to `main` run the `CI` workflow (build, lint, typecheck, test), and every push to `main` deploys the documentation site. Details: [Release Process](docs/guide/release-process.md).

## Repository layout

```text
packages/@mapomodule/      the @mapomodule/* packages
packages/mapomodule/       the meta-module
apps/example-e2e/          reference app: one page per scenario, in-memory mock API, MCP test bed
apps/example/              core demo against a real Camomilla backend
apps/example-theme/        theming and MapoOverride demo, no backend
apps/example-custom-form/  core and form with Vuetify fields, no UIKit
docs/                      the documentation site, also indexed by @mapomodule/mcp
scripts/                   build helpers and the release announcement
.github/workflows/         CI, Docs Pages, CD
AGENTS.md, .claude/        the AI agent setup: manuals, skills, subagents
```

## Contributing

Start from [Contributing](docs/contributing/index.md): setup, how a change is made, the definition of done, testing and documentation. AI agents (Claude Code, GitHub Copilot) start from [`AGENTS.md`](AGENTS.md); the setup is explained in [Working with AI agents](docs/contributing/ai-workflow.md).

## License

[MIT](LICENSE)

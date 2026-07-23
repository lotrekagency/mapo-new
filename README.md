# Mapo

Mapo is a Vue 3 / Nuxt 4 admin framework for building backoffice interfaces declaratively. It provides a CRUD engine, authentication, a composable UI kit with full theming support, and a component override system — all as individual packages that can be used together or independently.

## Packages

### Core packages

| Package             | Description                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `@mapomodule/core`  | API layer (`useCrud`), auth composables, HTTP interceptors, Nuxt middleware                             |
| `@mapomodule/store` | Pinia stores: auth, snack, confirm, sidebar + `usePermissions` composable                               |
| `@mapomodule/uikit` | UI shell (Sidebar, Topbar, Login, layout, theming, MapoOverride) + List/Detail engines + Media Manager  |
| `@mapomodule/utils` | Typed utilities: `deepMerge`, `objectDiff`, `debounce`, `buildRouteTree`, `humanFileSize`, `slugify`, … |
| `@mapomodule/form`  | Declarative typed form engine: `FieldDescriptor[]`, `useMapoForm()`, 14 field types, JSON Schema bridge |
| `@mapomodule/i18n`  | _(planned)_ `@nuxtjs/i18n` v9 wrapper with base translations                                            |
| `mapomodule`        | Meta-package: installs all `@mapomodule/*` modules with a single registration                           |

### Backend integrations

| Package                       | Description                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| `mapo-integrations-camomilla` | Nitro proxy for [Camomilla CMS](https://github.com/lotrekagency/camomilla) |

## Requirements

- Node.js >= 20
- pnpm >= 8

## Getting Started

```bash
pnpm install
pnpm build
```

## Scripts

### Apps

| Script                   | Port | Description                                                                            |
| ------------------------ | ---- | -------------------------------------------------------------------------------------- |
| `pnpm dev:example`       | 3000 | Core feature demo (login, CRUD, permissions, snackbar, sidebar, form engine)           |
| `pnpm dev:example-theme` | 3001 | Theming & override demo (CSS tokens, Nuxt UI config, MapoOverride, custom fields)      |
| `pnpm dev:example-form`  | —    | Custom form field demo (custom registry, `defineFormField`, Vuetify field integration) |
| `pnpm dev:example-e2e`   | —    | E2E test target app — one page per feature scenario                                    |
| `pnpm docs:dev`          | —    | VitePress documentation site                                                           |

### Package development

Run a watcher on a single package so `dist/` stays in sync during development:

| Script                | Package                              |
| --------------------- | ------------------------------------ |
| `pnpm dev:uikit`      | `@mapomodule/uikit`                  |
| `pnpm dev:core`       | `@mapomodule/core`                   |
| `pnpm dev:store`      | `@mapomodule/store`                  |
| `pnpm dev:utils`      | `@mapomodule/utils`                  |
| `pnpm dev:mapomodule` | `mapomodule`                         |
| `pnpm dev:camomilla`  | `mapo-integrations-camomilla`        |
| `pnpm dev:form`       | `@mapomodule/form`                   |
| `pnpm dev:packages`   | All packages in parallel (Turborepo) |

Typical workflow — two terminals:

```bash
# terminal 1: watch the package you're editing
pnpm dev:uikit

# terminal 2: run the demo app
pnpm dev:example-theme
```

### Build

| Script            | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `pnpm build`      | Build all packages via Turborepo (respects dependency order) |
| `pnpm docs:build` | Build the VitePress documentation site                       |

Type declarations during build:

- Packages run a dedicated declarations pass via `tsconfig.build-types.json`.
- TS-only packages use `tsc`; Vue SFC packages (`@mapomodule/form`, `@mapomodule/uikit`) use `vue-tsc`.
- SFC packages run `scripts/clean-empty-vue-dts.mjs` to remove empty `.vue.d.ts` stubs in `dist/`.

### Quality

| Script           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm lint`      | Run ESLint across all packages                   |
| `pnpm typecheck` | Run TypeScript type checking across all packages |
| `pnpm test`      | Run Vitest unit tests                            |

### Release

| Script                  | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm release:dry`      | Simulate the full release locally — no tags, no publish       |
| `pnpm release`          | Build and release all packages (used by CI on push to `main`) |
| `pnpm publish:packages` | Emergency manual publish, bypasses semantic-release           |

## Release Flow

Releases are powered by [multi-semantic-release](https://github.com/qiwi/multi-semantic-release). Versioning is driven by [Conventional Commits](https://www.conventionalcommits.org/) — no manual bumping required.

See [docs/guide/release-process.md](docs/guide/release-process.md) for the full documentation.

## Monorepo Structure

```
packages/@mapomodule/      individual @mapomodule/* packages
packages/mapomodule/       meta-package
apps/example/              core feature demo app
apps/example-theme/        theming & override demo app
apps/example-custom-form/  custom form field demo (defineFormField, third-party integration)
apps/example-e2e/          E2E test target — one page per feature scenario
e2e/                       Playwright E2E test suite
docs/                      VitePress documentation site
legacy/                    git submodules: mapo-v1 and mapo-v1-middleware (read-only reference)
```

# Contributing & Development Workflow

## Prerequisites

- Node.js >= 20
- pnpm >= 8

## Initial setup

```bash
pnpm install
pnpm build
```

`pnpm build` runs a full production build of all packages (via Turborepo). This is required once after cloning so that downstream packages can resolve each other.

## Dev setup (after initial build)

When working on packages locally, switch them to **stub mode** instead of rebuilding after every change:

```bash
# Stub all packages at once (from monorepo root)
pnpm dev:packages

# Or stub a single package
pnpm --filter @mapomodule/store dev:prepare
```

Stub mode replaces `dist/` with files that re-export directly from `src/`. This gives you:

- Instant type resolution in the IDE (no empty `.d.ts` files)
- No need to rebuild after every source change

After stubbing, regenerate the Nuxt app's auto-import types:

```bash
cd apps/example-e2e   # or whichever app you're using
pnpm nuxt prepare
```

> **Note:** if you accidentally run `pnpm build` on a package during development, re-run `dev:prepare` on it and then `nuxt prepare` on the app. The production build now includes a dedicated declaration pass (`tsc`/`vue-tsc` via `tsconfig.build-types.json`) and, for SFC packages, a cleanup step that removes zero-byte `.vue.d.ts` stubs.

---

## Git Hooks (Husky)

Two hooks run automatically on every commit.

### pre-commit — Prettier + focused tests

lint-staged runs two commands on the staged files:

1. **`prettier --write`** — formats all staged `.ts`, `.tsx`, `.vue`, `.json`, `.md` files in place.
2. **`vitest related --run`** — runs only the tests that cover the staged `.ts`/`.tsx`/`.vue` files.

`vitest related` inspects the import graph and executes only the subset of tests that directly or transitively import the changed files. If you modify `src/deepMerge.ts`, only `deepMerge.test.ts` runs — not the entire test suite.

### commit-msg — commitlint

Every commit message is validated against the [Conventional Commits](https://www.conventionalcommits.org/) spec. Invalid messages are rejected before the commit is recorded.

```
feat(core): add useMapoAuth composable      ✔
fix(form): correct nested accessor path     ✔
wip: stuff                                  ✘
```

---

## Running Tests

```bash
# All packages (via Turborepo)
pnpm test

# Single package
pnpm --filter @mapomodule/utils test

# Watch mode (during development)
pnpm --filter @mapomodule/utils exec vitest
```

---

## Type checking

```bash
# All packages (via Turborepo)
pnpm typecheck

# Single package
pnpm --filter @mapomodule/uikit typecheck
```

Pure-TypeScript packages (`core`, `store`, `utils`) type-check with `tsc --noEmit`.
The packages that ship Vue SFCs (`uikit`, `form`) type-check with **`vue-tsc --noEmit`**, so
`.vue` single-file components — including `<script setup>` and template bindings — are part
of the gate. Run `pnpm typecheck` before pushing; the CI `typecheck` job runs the same thing.

---

## Building

```bash
# All packages (respects dependency order)
pnpm build

# Single package
pnpm --filter @mapomodule/utils build
```

Build pipeline details:

- `nuxt-module-build build` emits runtime artifacts in `dist/`.
- `tsconfig.build-types.json` runs a declaration-only pass with stable mapping (`src` -> `dist`).
- TS-only packages use `tsc`; SFC packages (`form`, `uikit`) use `vue-tsc`.
- SFC packages run `node ../../../scripts/clean-empty-vue-dts.mjs dist` to remove empty `.vue.d.ts` / `.d.vue.ts` files that would degrade consumer typing.

---

## CI Pipeline

The GitHub Actions pipeline mirrors local checks and runs in this order:

```
lint & typecheck → test → release
```

The `release` job only runs on push to `main` after both previous jobs pass.

TODO: in a future iteration, expand the pipeline test stage with a matrix covering multiple supported Node.js versions, Nuxt versions, and other relevant compatibility targets instead of a single runtime combination.

See [Release Process](./release-process.md) for full details.

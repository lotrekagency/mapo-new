# Testing and verification

What to run before a change is handed over, how unit tests are written, and how to check a change in the running reference app.

## The gates

Run them from the repository root. All of them must pass, with no new errors and no new warnings.

| Command                | What it checks                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm build`           | Every package and app builds; the MCP knowledge base is regenerated.                      |
| `pnpm lint`            | ESLint over every package's `src/`.                                                       |
| `pnpm typecheck`       | `tsc --noEmit` for TypeScript packages, `vue-tsc --noEmit` for `form` and `uikit`.        |
| `pnpm test`            | Vitest in the packages that declare a `test` script: `utils`, `form`, `mcp`.              |
| `pnpm exec vitest run` | Every test file in the repository, including `core`, `store` and `uikit`.                 |
| `pnpm docs:build`      | The VitePress site builds. Broken markup fails it; dead links do not (`ignoreDeadLinks`). |

`pnpm test` runs after a build (`turbo` makes `test` depend on `build`), because the MCP tests read the generated knowledge base.

### Known warnings

These are present on a clean checkout and are not caused by your change:

- `pnpm lint` reports warnings (no errors) in `form` and `uikit`, mostly Vue template formatting rules.
- `pnpm build` prints, for the apps: `SOURCEMAP_BROKEN` warnings from `@tailwindcss/vite`; a `[nuxt-i18n]` notice that `mapo-i18n.config.mjs` is not found in the app's `i18n/` folder; and `Overriding MapoMediaManagerDialog component`, because `@mapomodule/uikit` registers that component twice (once by name, once as global).

Any other warning is new: fix it or explain it in the hand-over.

### Known gap

`core`, `store` and `uikit` have tests but no `test` script, so `pnpm test` and CI skip them. lint-staged still runs them on commit (`vitest related`), and `pnpm exec vitest run` from the root runs them on demand. Run it whenever you touch those packages.

## Unit tests

- **Runner**: Vitest, in a Node environment.
- **Location**: next to the code, in a `__tests__/` folder (`src/__tests__/` or `src/runtime/__tests__/`).
- **Names**: `<subject>.test.ts` or `<subject>.spec.ts`.
- **Config**: the root `vitest.config.ts` aliases the Nuxt virtual module `#imports` to a mock in `packages/@mapomodule/form/src/__tests__/__mocks__/nuxt-imports.ts` and defines `import.meta.server` as `true`. `form`, `mcp` and `utils` have their own `vitest.config.ts`.

Run a subset while you work:

```bash
pnpm --filter @mapomodule/form test                 # one package
pnpm exec vitest run packages/@mapomodule/store      # one folder, from the root
pnpm --filter @mapomodule/utils exec vitest          # watch mode
```

### What needs a test

- New logic with a branch, a loop, parsing or data mapping.
- Every bug fix: a test that fails before the fix and passes after it.
- Every public helper in `@mapomodule/utils`.
- Every new MCP tool, recipe, prompt or resource (see [Working on the MCP server](./mcp-server)).

A change of markup or styling alone needs no unit test; it needs the live check below.

## Live verification in the reference app

`apps/example-e2e` runs without a real backend: its `server/api/**` routes are an in-memory mock API. It has one page per scenario (auth, permissions, sidebar, form engine, lists, media, menus, i18n, feedback) and it is the test bed of the MCP server.

Check a change there when it affects rendering, routing, middleware, SSR or the MCP live tools:

```bash
pnpm build                    # or keep `pnpm dev:packages` running in stub mode
pnpm dev:example-e2e          # http://localhost:3000
```

- Log in with `admin` / `admin`. The `editor` and `viewer` accounts (password equal to the username) exercise permissions and roles.
- Request the pages you changed and check the status code and the rendered HTML: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login`.
- A new page returns 404 until the dev server restarts: Nuxt's server-side router keeps the route table it started with.
- Check the MCP endpoint, which only exists while the dev server runs:

  ```bash
  curl -s -X POST http://localhost:3000/mcp/mapo \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mapo_doctor","arguments":{}}}'
  ```

- Stop the dev server when you are done.

To typecheck an app as its users would:

```bash
cd apps/example-e2e
npx nuxt prepare
npx vue-tsc --noEmit -p .nuxt/tsconfig.app.json
```

## Browser end-to-end tests

There is no browser E2E suite yet. `apps/example-e2e` is shaped as its target: one page per scenario, sidebar entries generated from route metadata, a mock API with known users. A visual or interaction check is done by hand at review time; list it in the hand-over with the page, the breakpoint and the colour mode to look at.

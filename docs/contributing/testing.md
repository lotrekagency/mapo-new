# Testing and verification

What to run before a change is handed over, how unit tests are written, and how to check a change in the running reference app or in a project that installed Mapo from npm.

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

## Testing changes in a consumer app

To try a fix in a real project before it is released, link this workspace into an app that installed `mapomodule` from npm. Run it from the root of this repository:

```bash
pnpm dev:link ../my-project
```

The path points at the project root or directly at its Nuxt app (e.g. `../my-project/backoffice`), and is resolved from your current directory. A project root works when exactly one directory below it depends on `mapomodule`. Apps inside this workspace are refused: they already use the local packages.

The command (`scripts/dev-link.mjs`) finds every `mapomodule` and `@mapomodule/*` package installed in the app's `node_modules` (pnpm, yarn or npm layout) and overlays it with the local sources:

- `src/` becomes a copy of the local `src/`, kept in sync while the command runs;
- `dist/` becomes stubs that load `src/`;
- the published `dist/` and `src/` move to `<package>/.mapo-dev-link/`, where `--restore` finds them.

Everything happens inside the app's `node_modules`. The app's `package.json`, lockfile, `nuxt.config` and Docker files stay untouched, and the linked code resolves `vue`, `nuxt`, `pinia` and every other dependency from the app's own install.

> **Why not `link:` or `pnpm link`?** A symlinked package resolves its dependencies from this repository's `node_modules`. The app would load a second copy of `vue`, `nuxt`, `pinia` and `vue-i18n` (broken stores and injections) and native binaries built for the host OS, which fail in a Linux container. Inside a container, the symlink target does not even exist.

### Workflow

The steps below use a backoffice that runs `nuxt dev` in Docker with its directory bind-mounted (`backoffice/` mounted on `/app`, Compose service `mapo`). Without Docker, restart `nuxt dev` wherever the steps restart the container.

1. Start the project once, so that the container installs the backoffice dependencies. The command needs the app's `node_modules`.
2. Link from the root of this repository and leave the command running:

   ```bash
   pnpm dev:link ../my-project
   ```

   Nothing else needs to run here: the command copies `src/` as it is, so neither `pnpm build` nor `pnpm dev:packages` is needed. The exception is `@mapomodule/mcp`, whose knowledge base is copied from its `dist/knowledge`: if the app installs it, run `pnpm --filter @mapomodule/mcp build` first.

3. Restart the backoffice once, from the project directory, so that it loads the linked modules:

   ```bash
   docker compose restart mapo
   ```

   The log shows `[mapo:dev-link] Using local sources from …`.

4. Edit `packages/*/src` here:
   - runtime code (components, composables, stores, locales) hot-reloads in the browser;
   - module setup code (`src/module.ts` and the files it imports) restarts Nuxt on its own.

5. When you are done, stop the command with `Ctrl+C` (the link stays in place), then restore the published packages and restart the backoffice:

   ```bash
   pnpm dev:link ../my-project --restore
   docker compose restart mapo
   ```

The container runs `yarn` or `pnpm install` at startup. That keeps the link, because the lockfile has not changed and nothing gets reinstalled. If the app's dependencies are reinstalled anyway, a running `pnpm dev:link` links them again; restart the backoffice afterwards.

### Commands

| Command                            | Effect                                 |
| ---------------------------------- | -------------------------------------- |
| `pnpm dev:link <app>...`           | Link, then keep syncing until `Ctrl+C` |
| `pnpm dev:link <app>... --once`    | Link without watching                  |
| `pnpm dev:link <app>... --status`  | Show which packages are linked         |
| `pnpm dev:link <app>... --restore` | Put the published packages back        |

Several apps can be linked at once: `pnpm dev:link ../project-a ../project-b`.

### Things to know

- The local sources run against the dependencies installed in the app. If a package now needs a dependency that the app lacks, the command prints a warning. Add the dependency to the app temporarily, or update `mapomodule` there.
- Packages that the app does not install are skipped. For example, an app on an older `mapomodule` has no `@mapomodule/mcp`, and the meta-module then skips it.
- App code that imports `@mapomodule/*` directly, such as `mapooverride/` components, gets the local sources too.
- Some Docker setups don't forward file events into the container. If edits never reach the app, set `CHOKIDAR_USEPOLLING=1` in the backoffice service's environment.
- A linked app also builds with the local sources, so restore it before running `nuxt build` on that checkout. Production images are not affected: they install `node_modules` from the registry.

## Browser end-to-end tests

There is no browser E2E suite yet. `apps/example-e2e` is shaped as its target: one page per scenario, sidebar entries generated from route metadata, a mock API with known users. A visual or interaction check is done by hand at review time; list it in the hand-over with the page, the breakpoint and the colour mode to look at.

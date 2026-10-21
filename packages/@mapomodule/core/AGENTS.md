# AGENTS.md — `@mapomodule/core`

Local rules for the service layer: HTTP, CRUD, auth and route guards. The root [`AGENTS.md`](../../../AGENTS.md) still applies. The runtime call chains are drawn in [`docs/guide/architecture-flows.md`](../../../docs/guide/architecture-flows.md): read the flow you touch before changing it.

## What this package is

- `runtime/plugins/00.fetch.ts` provides `$mapoFetch`: a `$fetch` instance that resets the session and redirects to the login page on a 401 (except logout calls), and shows a "Permission denied" snackbar on a 403.
- `runtime/plugins/01.init.server.ts` hydrates the sidebar state from cookies and the user from `userInfoApi`, server-side, before any page renders.
- `runtime/middleware/`: the `auth`, `permissions` and `roles` route middleware.
- Composables, auto-imported: `useCrud`, `useMapoAuth`, `useMapo`, `useCanAccessRoute`, `useMapoFetch`.
- `module.ts` merges the options over `MAPO_DEFAULTS` into `runtimeConfig.public.mapoCore`, installs `@mapomodule/store` when missing, and adds the page-meta type augmentation from `runtime/page-meta.nuxt.d.ts`.

## Rules

1. **The backend contract is DRF.** `useCrud` builds `<endpoint>/<id>/` URLs through `normalizeEndpoint` and expects `{ count, results }` lists. A change in URL shape or payload expectations breaks every consumer backend: treat it as breaking, and update `docs/guide/concepts.md` and `docs/howto/backend-integration.md`.
2. **Stores are imported by subpath** (`@mapomodule/store/runtime/stores/auth`), never from `@mapomodule/store`: the root entry is the Nuxt module. `tsconfig.json` maps those subpaths to the store's sources for type checking.
3. **SSR and client paths both matter.** `00.fetch.ts` runs on both sides and reads `import.meta.server`; `01.init.server.ts` runs only on the server and must call the backend with an absolute URL so the integration proxy sees it.
4. **Options are public config.** A new option gets a default in `MAPO_DEFAULTS`, a type in `MapoOptions`, a row in the Options table of `docs/modules/core.md`, and a mention in `docs/guide/concepts.md` if apps commonly set it.
5. **Route meta keys are typed** in `runtime/page-meta.nuxt.d.ts`; a new key used by the guards or the sidebar goes there and in `docs/uikit/sidebar.md` or `docs/howto/auth-permissions.md`.

## Verify

```bash
pnpm exec vitest run packages/@mapomodule/core    # not part of `pnpm test`
pnpm --filter @mapomodule/core typecheck
pnpm --filter @mapomodule/core lint
```

The tests live in `src/runtime/__tests__/` and run with the root `vitest.config.ts`, which defines `import.meta.server` as `true`: the server branch of `00.fetch.ts` is the one under test. Changes to login, logout, 401/403 handling, middleware or SSR hydration also get the live check in `apps/example-e2e` with the `admin`, `editor` and `viewer` accounts.

## Gotchas

- **A request from `01.init.server.ts` bypasses the backend proxy** → it used a relative URL.
- **Types from `@mapomodule/store/runtime/*` resolve to nothing** → the `paths` override in `tsconfig.json` was dropped ([Known limitations](../../../docs/guide/known-limitations.md#tsconfig-paths-workaround-in-mapomodule-core)).
- **`installModule` deprecation warnings** → expected here: the resolver-based install is kept for pnpm strict layouts.

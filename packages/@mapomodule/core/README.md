# @mapomodule/core

The service layer of Mapo. Provides the typed CRUD factory, auth composable, route middleware, the `$mapoFetch` interceptor, and the boot plugins that wire everything together.

## Installation

In a Nuxt 4 app — typically you don't install this directly; install the meta-package [`mapomodule`](../../mapomodule/) which registers `core` together with `@mapomodule/store`. If you really want it standalone:

```bash
pnpm add @mapomodule/core
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/core"],
  mapoCore: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
    loginUrl: "/login",
  },
});
```

When installed via `mapomodule`, configure under the `mapo` key instead.

## What you get (auto-imported)

| API               | Purpose                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `useCrud<T>(url)` | Typed CRUD repository: `list`, `detail`, `create`, `update`, `partialUpdate`, `delete`, `updateOrCreate`, `updateOrder`, `options` |
| `useMapoAuth()`   | `login`, `logout`, `fetchUser` — drives the auth store                                                                             |
| `useMapoFetch()`  | Pre-configured `$fetch` with 401/403 interceptors                                                                                  |
| `useMapo()`       | Facade exposing the above as a single object                                                                                       |
| `auth` middleware | Route middleware: redirects unauthenticated users to `loginUrl`                                                                    |

## Dev workflow

```bash
pnpm dev:core   # from monorepo root — watch mode
```

## Configuration

All endpoints fall back to the `MAPO_DEFAULTS` constant exported from this package. See [docs/modules/core](../../../docs/modules/core.md) for the full reference.

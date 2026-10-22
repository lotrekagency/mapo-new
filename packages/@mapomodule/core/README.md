# @mapomodule/core

The service layer of Mapo: an auth-aware `$fetch`, a typed CRUD repository for Django REST Framework endpoints, the auth composable, the `auth`, `permissions` and `roles` route middleware, and a server-side plugin that loads the session before any page renders.

## Installation

Apps get it through the meta-package [`mapomodule`](https://www.npmjs.com/package/mapomodule) and set its options at the top level of the `mapo` key. On its own:

```bash
pnpm add @mapomodule/core@next
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/core"],
  mapoCore: {
    authLoginUrl: "/api/auth/login",
  },
});
```

It installs `@mapomodule/store` when the app does not register it. Mapo v2 is published on the `next` dist-tag while it is in beta.

## Options

| Option         | Default               | Description                                                               |
| -------------- | --------------------- | ------------------------------------------------------------------------- |
| `authLoginUrl` | `"/api/auth/login"`   | Endpoint called by `useMapoAuth().login()`                                |
| `userInfoApi`  | `"/api/profiles/me/"` | Endpoint that returns the logged-in user, called server-side on page load |
| `logoutUrl`    | `"/api/auth/logout"`  | Endpoint called by `useMapoAuth().logout()`                               |
| `loginUrl`     | `"/login"`            | Route that the `auth` middleware and a 401 response redirect to           |

## What you get

Composables are auto-imported and the middleware is registered by name.

| API                            | Purpose                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCrud<T>(endpoint)`         | Repository over a DRF endpoint: `list`, `detail`, `create`, `update`, `partialUpdate`, `delete`, `options`, `updateOrCreate`, `updateOrder`    |
| `useMapoAuth()`                | `login`, `logout` and `fetchUser`, kept in sync with `useAuthStore`                                                                            |
| `useMapoFetch()`               | `{ fetch, loading }`: the `$mapoFetch` instance and a flag that is `true` while any request is in flight                                       |
| `useMapo()`                    | One object exposing `$api`, `$auth`, `$snack` and `$confirm`                                                                                   |
| `useCanAccessRoute(meta)`      | Whether the current user passes a route's `auth`, `roles` and `permissions` checks                                                             |
| `$mapoFetch`                   | The `$fetch` instance behind all of the above: a 401 (except on logout) resets the session and redirects to `loginUrl`; a 403 shows a snackbar |
| `auth`, `permissions`, `roles` | Route middleware driven by `definePageMeta` (`permissions: { model }` or a list of codenames, `roles`)                                         |

Types such as `CrudRepository` and `PaginatedResponse` come from `mapomodule/types`.

## Documentation

- [@mapomodule/core](https://lotrekagency.github.io/mapo-new/modules/core)
- [Auth & permissions](https://lotrekagency.github.io/mapo-new/howto/auth-permissions)
- [Custom backend integration](https://lotrekagency.github.io/mapo-new/howto/backend-integration)
- [Architecture & Integration Flows](https://lotrekagency.github.io/mapo-new/guide/architecture-flows)
- [Composable & Function API Reference](https://lotrekagency.github.io/mapo-new/modules/api)

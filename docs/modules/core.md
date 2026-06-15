# @mapomodule/core

The service layer of Mapo. Provides the CRUD factory, auth composable, route middleware, the `useMapo` facade, and the two boot plugins that wire everything together.

## Installation

`@mapomodule/core` is included automatically when you install `mapomodule` (recommended). For standalone use:

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
  },
});
```

In practice, prefer `mapomodule` as the single entry point — it installs `@mapomodule/core` transitively and exposes the `mapo` config key.

## Options

| Option         | Type     | Default             | Description                                                       |
| -------------- | -------- | ------------------- | ----------------------------------------------------------------- |
| `authLoginUrl` | `string` | `/api/auth/login`   | Endpoint called by `useMapoAuth().login()`                        |
| `userInfoApi`  | `string` | `/api/profiles/me/` | Endpoint to fetch the logged-in user's profile                    |
| `logoutUrl`    | `string` | `/api/auth/logout`  | Endpoint called by `useMapoAuth().logout()`                       |
| `loginUrl`     | `string` | `/login`            | Page route the auth middleware redirects unauthenticated users to |

> When installed via the `mapomodule` meta-package, configure these options under `mapo:` instead of `mapoCore:`. The defaults are exported as `MAPO_DEFAULTS` from `@mapomodule/core`.

## Auto-imports

All composables are auto-imported in the Nuxt app — no explicit imports needed.

| Composable            | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `useCrud<T>()`        | CRUD repository factory                                 |
| `useMapoAuth()`       | Login / logout / fetchUser                              |
| `useMapo()`           | Facade aggregating the most common composables          |
| `useCanAccessRoute()` | Checks if the current user can access a route by perms  |
| `useMapoFetch()`      | Returns the `$mapoFetch` instance (auth-aware `$fetch`) |

---

## Boot plugins

`@mapomodule/core` registers two Nuxt plugins at startup. Plugin order is determined by the numeric prefix.

### `00.fetch.ts` — `$mapoFetch`

Runs on **both server and client**. Creates a `$fetch` instance with auth interceptors and exposes it as `$mapoFetch` via `useNuxtApp()`.

Behaviour:

- **401** (unauthenticated): calls `authStore.reset()` and, if on the client, redirects to `/login?redirect=<current-path>`
- **403** (forbidden): calls `useSnackStore().show('Permission denied', 'error')`
- All other responses pass through unchanged

`$mapoFetch` does **not** inject an `Authorization` header. Authentication is done via the `__mapo_session` HttpOnly cookie, which the browser/server attaches automatically to every same-origin request.

### `01.init.server.ts` — SSR session hydration

Runs **server-side only** on every request. Mirrors the Vuex `nuxtServerInit` pattern from v1.

Sequence:

1. `sidebarStore.hydrateFromCookies()` — restores sidebar state from request cookies
2. Reads `__mapo_session` cookie via `useCookie()` (SSR-safe — reads the incoming HTTP request headers)
3. If the cookie is absent, returns immediately (unauthenticated request)
4. Forwards the `cookie` header to the backend via `useRequestHeaders(['cookie'])`
5. Calls `$mapoFetch(absolute_url, { method: 'GET', headers })` with an **absolute URL** — required so the request routes through the Nitro proxy layer (`mapo-integrations-camomilla`) rather than bypassing it
6. Calls `authStore.setUser(user)` on success → `isAuthenticated` becomes `true`
7. On any error: `authStore.reset()` + clears `__mapo_session` cookie (stale or invalid session)

> **Why absolute URL?** An internal server-side `$fetch` call with a relative path would bypass Nitro middleware. The init plugin constructs `${protocol}//${host}${path}` from `useRequestURL()` to ensure the request enters the normal Nitro pipeline and gets the cookie/path rewriting from `mapo-integrations-camomilla`.

> **Why not read the cookie value directly?** `__mapo_session` is an HttpOnly cookie. Its value is readable in SSR (from HTTP request headers) but never from client JS. The plugin does not store or forward the raw token — it only forwards the `cookie` header wholesale, letting the backend validate the session.

---

## `useCrud<T>(endpoint, config?)`

Returns a typed repository for a REST resource.

```ts
const articles = useCrud<Article>("/api/articles/");

// List with pagination
const { results, count } = await articles.list({ page: 1, search: "hello" });

// Get single item
const item = await articles.detail(42);

// Create
const created = await articles.create({ title: "New" });

// Full replace
const updated = await articles.update(42, { title: "Updated" });

// Partial update (PATCH)
const patched = await articles.partialUpdate(42, { title: "Patched" });

// Delete
await articles.delete(42);

// Create if no id, update if id present
await articles.updateOrCreate({ id: 42, title: "Upsert" });

// Reorder (drag-and-drop)
await articles.updateOrder(startId, endId);
```

### Multipart uploads

`create`, `update`, and `partialUpdate` automatically detect `File` / `Blob` values and switch to `multipart/form-data`. Override with the `opts` argument:

```ts
// Always send as multipart
await articles.create(data, {}, { multipart: "force" });

// Never send as multipart (always JSON)
await articles.create(data, {}, { multipart: "disable" });
```

### Type reference

```ts
interface CrudRepository<T> {
  list(params?: ListParams, config?: CrudConfig): Promise<PaginatedResponse<T>>;
  detail(id: string | number, config?: CrudConfig): Promise<T>;
  create(data: Partial<T>, config?: CrudConfig, opts?: CrudOptions): Promise<T>;
  update(
    id: string | number,
    data: Partial<T>,
    config?: CrudConfig,
    opts?: CrudOptions,
  ): Promise<T>;
  partialUpdate(
    id: string | number,
    diff: Partial<T>,
    config?: CrudConfig,
    opts?: CrudOptions,
  ): Promise<T>;
  delete(id: string | number, config?: CrudConfig): Promise<void>;
  updateOrCreate(
    data: Partial<T> & { id?: string | number },
    config?: CrudConfig,
    opts?: CrudOptions,
  ): Promise<T>;
  updateOrder(
    startId: string | number,
    endId: string | number,
    config?: CrudConfig,
  ): Promise<void>;
}
```

---

## `useMapoAuth(options?)`

Auth composable. Handles login, logout, and user hydration.

```ts
const { login, logout, fetchUser } = useMapoAuth();

// Login
await login({ username: "admin", password: "secret" });

// Logout (clears cookie, resets store, redirects to /login)
await logout();

// Re-fetch current user info
await fetchUser();
```

### Login sequence

`login()` performs two requests:

1. `POST /api/auth/login` — the backend sets the `__mapo_session` HttpOnly cookie on success
2. `GET /api/profiles/me/` (via `fetchUser()`) — hydrates `authStore` with user info

After step 2, `auth.isAuthenticated` is `true`. There is no token to read from the response — authentication is derived entirely from the user info returned by the second request.

### Logout sequence

`logout()` is wrapped in a `try/finally` — the store is always cleared regardless of whether the backend call succeeds:

1. `POST /api/auth/logout` — the backend invalidates the Django session
2. `useCookie('__mapo_session').value = null` — clears the browser cookie
3. `authStore.reset()` — clears Pinia state
4. `navigateTo('/login')` — redirects

---

## `useMapo()`

Facade that aggregates the most common Mapo composables in one call.

```ts
const { $snack, $confirm } = useMapo();

$snack.show("Saved!", "success");
$snack.show("Something went wrong", "error");

const confirmed = await $confirm.ask({
  title: "Delete?",
  message: "This cannot be undone.",
});
```

---

## `useMapoFetch()`

Returns the global `$mapoFetch` instance together with a centralized `loading` indicator. `loading` tracks **all** in-flight `$mapoFetch` requests across the entire app — it is maintained by plugin-level `onRequest`/`onResponse` interceptors, so it reflects raw `useNuxtApp().$mapoFetch` calls too, not just calls made through this composable.

```ts
const { fetch, loading } = useMapoFetch();

async function submit(data: unknown) {
  await fetch("/api/articles/", { method: "POST", body: data });
}
```

```vue
<template>
  <!-- loading is true while ANY $mapoFetch request is in flight -->
  <UButton :loading="loading" @click="submit(payload)">Save</UButton>
</template>
```

`useMapoFetch` is auto-imported — no manual import needed. `loading` is a `ComputedRef<boolean>` that handles concurrent calls correctly (stays `true` until the last in-flight request completes).

You can also access the loading state directly from anywhere without destructuring:

```ts
const { $mapoFetchLoading } = useNuxtApp();
// use $mapoFetchLoading in a template or composable
```

> **vs `useCrud`**: prefer `useCrud<T>()` for standard REST resources — it adds typed methods, multipart handling, and differential PATCH. Use `useMapoFetch` for one-off calls or non-REST endpoints.

---

## Route middleware

Three named route middleware are registered automatically:

| Middleware    | Behaviour                                                          |
| ------------- | ------------------------------------------------------------------ |
| `auth`        | Redirects to `/login` if `authStore.isAuthenticated` is false      |
| `permissions` | Checks `route.meta.permissions` — supports two formats (see below) |
| `roles`       | Checks `route.meta.roles` against the user's groups                |

Apply them in `definePageMeta`:

```ts
definePageMeta({
  middleware: ["auth", "permissions"],
  permissions: { model: "article" },
  roles: ["editor", "admin"],
});
```

### `permissions` field — two formats

**`{ model: string }` (recommended for Django backends)**

Derives all CRUD actions for a Django model from the user's raw permissions:

```ts
// User has: add_article, change_article, view_article (not delete_article)
definePageMeta({
  middleware: ["auth", "permissions"],
  permissions: { model: "article" },
});

// After navigation, authStore.pagePermissions["route-name"] === ["add", "change", "view"]
// Blocks navigation entirely if the user does not have view_article
```

Use `pagePermissions` in components to gate individual operations:

```vue
<script setup lang="ts">
const auth = useAuthStore();
const route = useRoute();
const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
</script>

<template>
  <UButton v-if="pagePerms.includes('add')" @click="create">New</UButton>
  <UButton v-if="pagePerms.includes('delete')" color="red" @click="remove"
    >Delete</UButton
  >
</template>
```

Superusers bypass the check and receive `["view", "add", "change", "delete"]` automatically.

**`string[]` (explicit codenames)**

Checks that the user has every listed raw Django permission codename. Does **not** populate `pagePermissions`.

```ts
definePageMeta({
  middleware: ["auth", "permissions"],
  permissions: ["view_article", "change_article"],
});
```

Use this when you need to combine permissions from different models, or when the model-based pattern does not apply.

---

## SSR session hydration (summary)

On every server-side render, the `01.init.server` plugin runs **before** any route middleware:

1. Reads sidebar cookies → hydrates `useSidebarStore`
2. Reads `__mapo_session` cookie → calls `userInfoApi` (absolute URL, with forwarded `cookie` header) → hydrates `useAuthStore`
3. On fetch error → resets auth store and clears the cookie (stale session)

This is the v2 equivalent of Vuex `nuxtServerInit`. See [Architecture Flows](/guide/architecture-flows) for the full call graph.

---

## Known limitations

See [Known Limitations](/guide/known-limitations) for active TODOs, including notes on the current `installModule`/`moduleDependencies` hybrid strategy and the subpath import workaround required by `nuxt-module-builder`.

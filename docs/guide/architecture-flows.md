# Architecture & Integration Flows

This page explains how Mapo's packages work together at runtime. Each flow shows the full call chain across modules.

---

## Package map

```
mapomodule                          ← real Nuxt module: installs @mapomodule/core if not present
├── @mapomodule/core                      ← service layer (CRUD, auth, middleware, boot plugins)
│   └── depends on @mapomodule/store      ← Pinia stores (auth, sidebar, snack, confirm)
└── mapo-integrations-camomilla  (optional)     ← Nitro proxy middleware for Camomilla CMS
    └── independent of core/store
```

### Module relationships

`mapomodule` is a thin **meta-module**: it installs `@mapomodule/core`, `@mapomodule/store`, `@mapomodule/uikit`, and `@mapomodule/form` transitively with resolver-based `installModule(...)` calls (pnpm strict compatible). It does not re-export anything — it simply ensures the full Mapo stack is registered with a single `modules[]` entry.

`@mapomodule/core` depends on `@mapomodule/store` at **build time** via package.json `dependencies`. At runtime, stores are accessed through composables (`useAuthStore()`, `useSnackStore()`) which are auto-imported by Nuxt — there is no static import of the module entry from runtime code.

`mapo-integrations-camomilla` sits at the **Nitro layer** — it runs on the server before Nuxt's rendering pipeline. It has no knowledge of stores or composables. It communicates with `@mapomodule/core` purely through HTTP: the proxy rewrites paths and manages cookies; `@mapomodule/core` plugins consume the resulting HTTP responses.

---

## Flow 1 — SSR page load with an active session

What happens when a user with a `__mapo_session` cookie visits the app:

```
Browser → GET /admin/articles
  │
  ├─ Nitro middleware (mapo-integrations-camomilla)
  │    Not an /api path — passes through
  │
  ├─ Nuxt server plugin: mapo-core:fetch (00.fetch.ts)
  │    Registers $mapoFetch with 401/403 interceptors
  │
  ├─ Nuxt server plugin: mapo-core:init (01.init.server.ts)
  │    ├─ sidebarStore.hydrateFromCookies()       ← reads sidebar_drawer etc.
  │    ├─ reads __mapo_session via useCookie()
  │    │    (HttpOnly — readable server-side from request headers)
  │    ├─ $mapoFetch GET http://host/api/profiles/me/
  │    │    (absolute URL required to pass through Nitro proxy)
  │    │     ↓ intercepted by mapo-integrations-camomilla proxy
  │    │     ↓ maps __mapo_session → sessionid cookie header
  │    │     ↓ rewritten to /api/camomilla/users/current/
  │    │     ↓ forwarded to Camomilla backend
  │    │     ↓ response: { id, username, groups, all_permissions, ... }
  │    └─ authStore.setUser(response)  ← isAuthenticated becomes true
  │
  ├─ Route middleware: auth
  │    authStore.isAuthenticated === true → continue
  │
  └─ Page renders with hydrated state (no flash, no second request)
```

---

## Flow 2 — Login

```
User submits login form
  │
  ├─ useMapoAuth().login({ username, password })
  │    │
  │    ├─ Step 1: $mapoFetch POST /api/auth/login
  │    │     ↓ mapo-integrations-camomilla proxy:
  │    │     ├─ strips existing session cookies from request
  │    │     ├─ rewrites to /api/camomilla/auth/login/
  │    │     ├─ forwards to Camomilla
  │    │     ↓ Camomilla response body: {"detail": "Logged in"}
  │    │     ↓ Camomilla response: Set-Cookie: sessionid=abc123 (HttpOnly)
  │    │     ├─ proxy aliases sessionid as __mapo_session
  │    │     └─ if syncCamomillaSession=false: strips raw sessionid
  │    │
  │    │   Browser receives: Set-Cookie: __mapo_session=abc123 (HttpOnly)
  │    │   The cookie value is NOT readable from JS — no token is stored in state.
  │    │
  │    └─ Step 2: fetchUser() → $mapoFetch GET /api/profiles/me/
  │          ↓ proxy maps __mapo_session → sessionid
  │          ↓ Camomilla validates session, returns user info
  │          └─ authStore.setUser(user)  ← isAuthenticated = true
  │
  └─ navigateTo('/') or redirect target
```

> **Why two requests?** The backend login response only confirms the session was created — it does not return user data. `fetchUser()` is the canonical way to hydrate the auth store, and it's the same call used by SSR hydration. There is no token in the response body to read.

---

## Flow 3 — CRUD operation (authenticated)

```
Component calls: useCrud<Article>('/api/articles/').list({ page: 1 })
  │
  └─ $mapoFetch GET /api/articles/?page=1
        ↓ mapo-integrations-camomilla proxy:
        ├─ maps __mapo_session → sessionid cookie header
        ├─ adds X-CSRFToken header from csrftoken cookie
        ├─ adds X-Forwarded-Host / X-Forwarded-Proto from Referer
        ├─ path /api/articles/ — no specific rewrite → passes through
        └─ forwards GET /api/articles/?page=1 to Camomilla
              ↓ response: { results: [...], count: 42 }
        returns PaginatedResponse<Article>
```

---

## Flow 4 — Multipart file upload

```
Component calls: useCrud<Media>('/api/media/').create({ title: 'Photo', file: File })
  │
  ├─ applyMultipartPolicy(data, 'auto')
  │    ↳ detects File in data → converts to FormData
  │
  └─ $mapoFetch POST /api/media/ (body: FormData)
        ↓ mapo-integrations-camomilla proxy:
        ├─ rewrites /api/media → /api/camomilla/media
        └─ forwards multipart request to Camomilla
```

---

## Flow 5 — Permission-gated route

```
User navigates to /articles/42/edit
  │
  ├─ Route middleware: auth       → authStore.isAuthenticated true ✓
  │
  ├─ Route middleware: permissions
  │    └─ reads route.meta.permissions: { model: 'article', action: 'change' }
  │    └─ authStore.modelPermissions['article'].change === true → continue ✓
  │         or false → navigateTo('/403')
  │
  └─ Page renders
```

Page definition:

```ts
definePageMeta({
  middleware: ["auth", "permissions"],
  permissions: { model: "article", action: "change" },
});
```

---

## Flow 6 — Logout

```
User clicks logout
  │
  └─ useMapoAuth().logout()
        ├─ try: $mapoFetch POST /api/auth/logout
        │     ↓ proxy: rewrites to /api/camomilla/auth/logout/
        │     ↓ Camomilla deletes the Django session
        │
        └─ finally (always runs, even if backend call fails):
              ├─ useCookie('__mapo_session').value = null  ← clears browser cookie
              ├─ authStore.reset()                          ← isAuthenticated = false
              └─ navigateTo('/login')
```

---

## Flow 7 — 401 response (session expired mid-session)

```
Component makes any $mapoFetch call
  │
  └─ Backend returns 401 Unauthorized
        ↓ $mapoFetch onResponseError interceptor (00.fetch.ts)
        ├─ authStore.reset()
        └─ if client-side: navigateTo('/login?redirect=<current-path>')
```

This handles the case where the Django session expires after the user has loaded the app. No polling is needed — every failed request triggers cleanup automatically.

---

## Data flow summary

| Layer                               | Technology                    | Responsibility                                  |
| ----------------------------------- | ----------------------------- | ----------------------------------------------- |
| Browser                             | Vue 3 / Nuxt 4                | UI, composable calls                            |
| Nuxt server plugin `00.fetch`       | `@mapomodule/core`            | `$mapoFetch` with 401/403 interceptors          |
| Nuxt server plugin `01.init.server` | `@mapomodule/core`            | SSR hydration (auth + sidebar)                  |
| Pinia stores                        | `@mapomodule/store`           | Auth state, UI state, snack, confirm            |
| Composables                         | `@mapomodule/core`            | `useCrud`, `useMapoAuth`, `useMapo`             |
| Route middleware                    | `@mapomodule/core`            | Auth, permission, role guards                   |
| Nitro proxy                         | `mapo-integrations-camomilla` | Path rewriting, cookie sync, backend forwarding |
| Backend                             | Camomilla / Django            | Data, auth, media                               |

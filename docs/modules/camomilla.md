# mapo-integrations-camomilla

Nuxt module that integrates Mapo with [Camomilla CMS](https://github.com/lotrekagency/camomilla). It works as a **Nitro server-side proxy**: every `/api/*` request from the Nuxt app is intercepted, the path is rewritten to the correct Camomilla endpoint, and the request is forwarded to the backend. Cookie handling and session sync are managed transparently.

## Prerequisites

On the Django/Camomilla side:

```python
# settings.py
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "camomilla.authentication.SessionAuthentication",
        # ... other classes
    ),
}

USE_X_FORWARDED_HOST = True  # required for correct media URLs
```

Minimum Camomilla version: **django-camomilla-cms >= 5.7.1**

## Installation

```bash
pnpm add @mapomodule/mapo-integrations-camomilla
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/mapo-integrations-camomilla"],
  camomilla: {
    server: "http://localhost:8000",
  },
});
```

## Options

| Option                 | Type                    | Default                   | Description                                                                                          |
| ---------------------- | ----------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `server`               | `string`                | `'http://localhost:8000'` | URL of the Camomilla backend                                                                         |
| `base`                 | `string`                | `''`                      | API prefix in the request path itself, not the Nuxt router base — [see below](#sub-path-deployments) |
| `syncCamomillaSession` | `boolean`               | `false`                   | Enable SSO between Mapo and Django admin — see below                                                 |
| `forwardedHeaders`     | `string[]`              | `[]`                      | Additional request headers to forward to the backend                                                 |
| `pathRewrite`          | `Record<string,string>` | `{}`                      | Custom path rewrites, evaluated before the built-in ones                                             |
| `skipPaths`            | `string[]`              | `[]`                      | Extra `/api/*` prefixes the proxy must not intercept                                                 |
| `mediaAdapter`         | `boolean`               | `true`                    | Register the Camomilla media adapter — see below                                                     |

## Media adapter

When `mediaAdapter` is `true` (default), the module registers a client `$mapoMediaAdapter` plugin that maps the Media Manager's canonical params and payloads to Camomilla's dialect:

- mime filter → `fltr=mime_type=<value>`
- detail fetch → `language_code` query param for per-language metadata
- folder create/update payload → `{ title, slug, updir }` (canonical `{ name, parent }`); `slug` is auto-derived from the name
- folder reads normalized back to the canonical `{ name, parent, path }`
- file replace flag → `same_url` (canonical `maintain_url`)

This lets the [Media Manager](/uikit/media) talk to a Camomilla backend with no extra configuration. Set `mediaAdapter: false` to keep the default REST adapter (e.g. when pointing the media endpoints at a non-Camomilla service).

**In-repo only**: the option and the plugin exist just in the copy vendored under `packages/@mapomodule/mapo-integrations-camomilla/`. The published package has no `mediaAdapter` option and ships no client plugin — the divergence with the in-repo copy runs in both directions, see [Sub-path deployments](#sub-path-deployments).

The media endpoints themselves are already path-rewritten: `/api/media` → `/api/camomilla/media` and `/api/media-folders` → `/api/camomilla/media-folders`.

## Path rewriting

The proxy rewrites these paths automatically. After rewriting, a deduplication pass removes any accidental double slashes that can appear when the source path already ends with `/` and the rewrite target also starts with `/`:

```ts
rewritten.replace(/([^:]\/)\/+/g, "$1");
```

This prevents requests like `/api/profiles/me/` from being rewritten to `/api/camomilla/users/current//`.

### Rewrite table

| Nuxt app path        | Camomilla backend path          |
| -------------------- | ------------------------------- |
| `/api/auth/login`    | `/api/camomilla/auth/login/`    |
| `/api/auth/logout`   | `/api/camomilla/auth/logout/`   |
| `/api/profiles/me`   | `/api/camomilla/users/current/` |
| `/api/media-folders` | `/api/camomilla/media-folders`  |
| `/api/media`         | `/api/camomilla/media`          |
| `/api/menus`         | `/api/camomilla/menus`          |
| `/api/<anything>`    | `/api/<anything>`               |

The `menus` rewrite covers the sub-resources the [Menu Manager](/uikit/menu-manager) calls too — `/api/menus/12` and `/api/menus/page_types` land on `/api/camomilla/menus/12` and `/api/camomilla/menus/page_types`. Point the component at the Mapo-side path:

```vue
<MapoMenuManager endpoint="/api/menus" :identifier="id" />
```

Custom rewrites are evaluated **before** the defaults and the first match wins, so they both extend the built-in mapping and override it — a custom `'^/api/auth/login'` key replaces the built-in one:

```ts
camomilla: {
  server: 'http://localhost:8000',
  pathRewrite: {
    '^/api/custom-resource': '/api/camomilla/my-custom-resource',
  }
}
```

## Paths the proxy leaves alone

Only `/api/*` requests are intercepted, and two prefixes are always excluded so the Nuxt app can serve them itself:

- `/api/_nuxt_icon` — the icon server bundle
- `/api/mock` — the convention used by the example apps for local mocks

Add your own with `skipPaths`; the values **extend** the built-ins rather than replacing them, so you cannot accidentally start proxying Nuxt internals:

```ts
camomilla: {
  server: 'http://localhost:8000',
  skipPaths: ['/api/webhooks', '/api/og-image'],
}
```

Any request whose path starts with one of these prefixes is handled by your own `server/api/**` route.

## Sub-path deployments

Mounting the admin under a sub-path — `app: { baseURL: '/backoffice/' }` — is supported and needs no proxy configuration, but only because the middleware reads the request target from `event.node.req.url`: h3 has already stripped the base from it by the time the middleware runs, so the path the proxy sees is `/api/...`, exactly as in a root deploy.

`getRequestURL(event)` is **not** an equivalent shortcut and must never be swapped back in. It prefers `req.originalUrl`, which Nitro captures _before_ that strip, so under a sub-path deploy it still returns `/backoffice/api/...`: the `/api` guard never matches, and every proxied call — login included — falls through to the page router and 404s. `event.path` alone is no substitute either (h3 percent-decodes it and leaves dot segments unresolved), which is why the source parses `event.node.req.url` through `URL`. The full reasoning is in the comment above that line in `src/runtime/server/middleware/proxy.ts`.

Leave `camomilla.base` empty in that case. Setting it to `'/backoffice'` makes every built-in rewrite key (`^/api/auth/login`, …) expect a prefix that has already been stripped, nothing matches, and the request is forwarded unrewritten — login then 404s on Camomilla. `base` is only for an extra prefix that is really present in the incoming path.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  app: { baseURL: "/backoffice/" },
  camomilla: {
    server: "http://localhost:8000",
    // base stays '' — h3 has already stripped /backoffice/
  },
});
```

The base-stripping fix shipped in **`@mapomodule/mapo-integrations-camomilla` 2.0.0-beta.4** — upgrade if you are pinned to `2.0.0-beta.3` or earlier. (Do not read that version as a suite version: `mapomodule` and `@mapomodule/*` are released on their own beta counters.)

The copy vendored in this repo under `packages/@mapomodule/mapo-integrations-camomilla/` has not been synced with that release yet: it still calls `getRequestURL(event)` and hardcodes its skip list instead of reading `skipPaths`. The sub-path behaviour above, `skipPaths` and the `/api/menus` rewrite are all published-package features — build a sub-path deploy against the in-repo copy and it will 404. The divergence runs the other way too: see [Media adapter](#media-adapter).

## Response headers

The proxy forwards the backend's status and headers, with the exception of:

- `content-encoding` and `content-length` — `fetch` transparently decompresses the upstream body, so forwarding the original values would make the browser try to decode already-decoded bytes. Nitro recomputes both when it sends the response.
- `set-cookie` — handled separately by the [cookie logic](#cookie-and-session-handling) below.
- `transfer-encoding`, `connection`, `keep-alive` — hop-by-hop headers that must not be proxied.

## Cookie and session handling

The proxy manages three cookies:

| Cookie           | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `__mapo_session` | Mapo's auth token (alias for Django's `sessionid`) |
| `sessionid`      | Django session cookie                              |
| `csrftoken`      | Django CSRF token                                  |

All other cookies are stripped from requests to the backend.

### On every request

- `__mapo_session` is mapped to `sessionid` so Camomilla recognises the Django session
- `csrftoken` is forwarded as the `X-CSRFToken` header (required for POST/PUT/PATCH/DELETE)
- `X-Forwarded-Host` and `X-Forwarded-Proto` are derived from the `Referer` header

### On login / logout

- Camomilla's `sessionid` response cookie is aliased as `__mapo_session` — this is how Mapo picks up the session after login
- The original `sessionid` cookie is stripped from the response (unless `syncCamomillaSession: true`)

## `syncCamomillaSession`

When `false` (default): Mapo and Django admin have independent sessions. Logging in to Mapo does not log you into Django admin, and vice versa.

When `true`: both `sessionid` and `__mapo_session` are kept in sync. Logging in from either Mapo or the Django admin panel authenticates you on both sides simultaneously. Useful during development or when the same team uses both interfaces.

```ts
camomilla: {
  server: 'http://localhost:8000',
  syncCamomillaSession: true,
}
```

## Integration with `@mapomodule/core`

`mapo-integrations-camomilla` and `@mapomodule/core` are designed to work together without any glue code.

> **SSR proxy routing**: The `@mapomodule/core` init server plugin calls `userInfoApi` using an **absolute URL** (`http://host/api/profiles/me/`). This is required so the internal server-side `$fetch` call enters Nitro's request pipeline and gets intercepted by this proxy — a relative path would bypass Nitro middleware entirely.

- `useMapoAuth()` calls `/api/auth/login` → proxy rewrites to `/api/camomilla/auth/login/`
- `useCrud('/api/articles/')` calls `/api/articles/` → proxy forwards to `/api/articles/` on the backend
- `userInfoApi: '/api/profiles/me/'` → proxy rewrites to `/api/camomilla/users/current/`

```ts
// nuxt.config.ts — full example
export default defineNuxtConfig({
  modules: ["mapomodule", "@mapomodule/mapo-integrations-camomilla"],
  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
  },
  camomilla: {
    server: process.env.CAMOMILLA_URL ?? "http://localhost:8000",
    syncCamomillaSession: false,
  },
});
```

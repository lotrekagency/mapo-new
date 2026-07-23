# mapo-integrations-camomilla

Mapo integration for [Camomilla CMS](https://github.com/lotrekagency/camomilla). Implemented as a Nuxt module that adds a Nitro server middleware: every `/api/*` request is intercepted, path-rewritten to the matching Camomilla endpoint, and proxied to the backend with cookie/CSRF handling.

## Installation

```bash
pnpm add mapo-integrations-camomilla
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["mapomodule", "mapo-integrations-camomilla"],

  camomilla: {
    server: "http://localhost:8000",
    syncCamomillaSession: false,
    base: "",
    forwardedHeaders: [],
    pathRewrite: {}, // merged on top of the built-in rewrites
    changeOrigin: true,
    mediaAdapter: true, // register the Camomilla media adapter (default true)
  },
});
```

## What it does

- **Path rewriting**: `/api/auth/login` → `/api/camomilla/auth/login/`, `/api/profiles/me` → `/api/camomilla/users/current/`, `/api/media[-folders]` → `/api/camomilla/media[-folders]`. Custom rewrites can be added via the `pathRewrite` option.
- **Cookie sync**: maps Mapo's `__mapo_session` to Django's `sessionid` on outgoing requests, and aliases `sessionid` back to `__mapo_session` on auth-path responses.
- **CSRF**: forwards `csrftoken` as `X-CSRFToken` on every non-login request.
- **Forwarded headers**: optional whitelist of extra request headers to forward to the Camomilla backend.
- **Media adapter**: registers a `$mapoMediaAdapter` so the [Media Manager](../uikit/) speaks Camomilla's dialect — mime filter → `fltr=mime_type=`, detail fetch → `language_code`. Disable with `mediaAdapter: false`.

## Source of truth

All cookie names and Mapo-side path constants live in [`src/constants.ts`](./src/constants.ts) — no magic strings in the proxy or cookie sync code.

## Dev workflow

```bash
pnpm dev:camomilla   # from monorepo root — watch mode
```

## Reference

See [docs/modules/camomilla](../../../docs/modules/camomilla.md) for the full reference, and [docs/modules/integrations-howto](../../../docs/modules/integrations-howto.md) if you want to write your own backend integration.

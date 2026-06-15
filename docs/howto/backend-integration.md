# Custom backend integration

How to connect Mapo to any REST API backend — not just Camomilla. You'll write a Nuxt module that adds a Nitro proxy middleware.

## When to use this

- Your backend is not Camomilla (Django + Camomilla CMS)
- You need custom path rewrites, token auth (JWT Bearer), or response transformation
- You're using Laravel, FastAPI, Node.js, Strapi, or any other REST API

If you **are** using Camomilla, install `mapo-integrations-camomilla` instead and skip this guide.

## How it works

Mapo expects these three endpoints to exist in the Nuxt app:

| Mapo config key | Nuxt-side path      |
| --------------- | ------------------- |
| `authLoginUrl`  | `/api/auth/login`   |
| `logoutUrl`     | `/api/auth/logout`  |
| `userInfoApi`   | `/api/profiles/me/` |

Your integration module adds a Nitro middleware that proxies these (and any other `/api/*`) calls to the real backend.

## Minimal integration

```ts
// modules/my-backend/module.ts
import { defineNuxtModule, addServerHandler, createResolver } from "@nuxt/kit";

export interface MyBackendOptions {
  server: string;
}

export default defineNuxtModule<MyBackendOptions>({
  meta: { name: "my-backend", configKey: "myBackend" },
  defaults: { server: "http://localhost:3001" },

  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    nuxt.options.runtimeConfig.myBackend = {
      server: options.server,
    };

    addServerHandler({
      middleware: true,
      handler: resolver.resolve("./runtime/server/middleware/proxy"),
    });
  },
});
```

```ts
// modules/my-backend/runtime/server/middleware/proxy.ts
import {
  defineEventHandler,
  getRequestURL,
  getRequestHeaders,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
  send,
} from "h3";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const { server } = config.myBackend as { server: string };

  const url = getRequestURL(event);
  if (!url.pathname.startsWith("/api")) return; // only proxy /api/* routes

  const targetUrl = `${server}${url.pathname}${url.search}`;

  const headers = { ...(getRequestHeaders(event) as Record<string, string>) };
  delete headers["host"];

  const method = event.method;
  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : await readRawBody(event);

  const response = await fetch(targetUrl, { method, headers, body });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  setResponseHeaders(event, responseHeaders);
  setResponseStatus(event, response.status, response.statusText);
  return send(event, Buffer.from(await response.arrayBuffer()));
});
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule", "./modules/my-backend/module"],
  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
  },
  myBackend: {
    server: process.env.BACKEND_URL ?? "http://localhost:3001",
  },
});
```

## Common patterns

### JWT Bearer token auth

If your backend uses JWT tokens stored in a cookie:

```ts
import { parseCookies, appendResponseHeader } from "h3";

const cookies = parseCookies(event);
if (cookies.__mapo_session) {
  headers["Authorization"] = `Bearer ${cookies.__mapo_session}`;
}
```

### Path rewriting

Map Mapo's expected paths to your backend's actual paths:

```ts
const rewrites: Record<string, string> = {
  "^/api/auth/login": "/auth/token/",
  "^/api/auth/logout": "/auth/logout/",
  "^/api/profiles/me": "/users/me/",
  "^/api": "/v1", // catch-all: /api/articles → /v1/articles
};

let path = url.pathname;
for (const [pattern, replacement] of Object.entries(rewrites)) {
  if (new RegExp(pattern).test(path)) {
    path = path.replace(new RegExp(pattern), replacement);
    break;
  }
}

const targetUrl = `${server}${path}${url.search}`;
```

### Response transformation

If your backend returns a different shape from what Mapo expects:

```ts
// Backend: { items: [...], total: 100 }
// Mapo expects: { results: [...], count: 100 }

const response = await fetch(targetUrl, { method, headers, body });

if (url.pathname.startsWith("/api/articles")) {
  const json = await response.json();
  const transformed = { results: json.items, count: json.total };
  setResponseStatus(event, response.status);
  setResponseHeaders(event, { "content-type": "application/json" });
  return send(event, JSON.stringify(transformed));
}
```

### Session cookie aliasing

Mapo reads the `__mapo_session` cookie for auth. If your backend sets a differently named session cookie, alias it:

```ts
import { appendResponseHeader } from "h3";

// On login response
const setCookies = response.headers.getSetCookie();
for (const raw of setCookies) {
  appendResponseHeader(event, "set-cookie", raw);

  // Alias your session cookie as __mapo_session
  if (raw.startsWith("my_session=")) {
    const aliased = raw.replace("my_session=", "__mapo_session=");
    appendResponseHeader(event, "set-cookie", aliased);
  }
}
```

On logout, clear both cookies:

```ts
appendResponseHeader(
  event,
  "set-cookie",
  "my_session=; Max-Age=0; Path=/; HttpOnly",
);
appendResponseHeader(
  event,
  "set-cookie",
  "__mapo_session=; Max-Age=0; Path=/; HttpOnly",
);
```

### CSRF tokens

Django / Laravel backends often require a CSRF token header:

```ts
const cookies = parseCookies(event);
if (cookies.csrftoken) {
  headers["X-CSRFToken"] = cookies.csrftoken;
}
```

## Integration checklist

Before shipping, verify these all work:

- [ ] `/api/auth/login` → backend login endpoint → sets `__mapo_session` cookie
- [ ] `/api/auth/logout` → backend logout → clears `__mapo_session` cookie
- [ ] `/api/profiles/me/` → returns user object with `username`, `email`, `groups`, `all_permissions`
- [ ] All `/api/*` routes are proxied
- [ ] `host` header is stripped (avoids `400 Bad Request` from some backends)
- [ ] CSRF mechanism forwarded if required by backend
- [ ] Backend URL stored in `runtimeConfig` (server-only — never `runtimeConfig.public`)

## Example: FastAPI backend

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule", "./modules/fastapi/module"],
  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
  },
  fastapi: {
    server: process.env.FASTAPI_URL ?? "http://localhost:8001",
  },
});
```

```ts
// modules/fastapi/runtime/server/middleware/proxy.ts
const rewrites = {
  "^/api/auth/login": "/auth/jwt/create/",
  "^/api/auth/logout": "/auth/logout/",
  "^/api/profiles/me": "/auth/users/me/",
};

// After login: extract access token from response body and set as __mapo_session cookie
if (url.pathname.startsWith("/api/auth/login") && response.ok) {
  const json = await response.json();
  appendResponseHeader(
    event,
    "set-cookie",
    `__mapo_session=${json.access}; Path=/; HttpOnly; SameSite=Lax`,
  );
  setResponseStatus(event, 200);
  setResponseHeaders(event, { "content-type": "application/json" });
  return send(event, JSON.stringify({ ok: true }));
}
```

→ See also: [Camomilla CMS integration](/modules/camomilla), [Writing your own integration (full reference)](/modules/integrations-howto)

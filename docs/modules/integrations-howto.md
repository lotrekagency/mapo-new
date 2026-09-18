# Writing a Custom Backend Integration

Mapo is backend-agnostic. `@mapomodule/mapo-integrations-camomilla` is the reference integration for Camomilla CMS, but you can write an integration for any backend — Django REST Framework, Laravel, Express, Strapi, or a custom API.

An integration is simply a **Nuxt module** that adds a Nitro server middleware. The middleware intercepts `/api/*` requests and does whatever is needed: path rewriting, auth header injection, response transformation, etc.

---

## Minimal example

This is the smallest possible integration — it just proxies all `/api/*` requests to a backend, injecting a static API key:

```ts
// my-backend-integration/src/module.ts
import { defineNuxtModule, addServerHandler, createResolver } from "@nuxt/kit";

export interface MyBackendOptions {
  server: string;
  apiKey: string;
}

export default defineNuxtModule<MyBackendOptions>({
  meta: { name: "my-backend", configKey: "myBackend" },
  defaults: { server: "http://localhost:3001", apiKey: "" },

  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    nuxt.options.runtimeConfig.myBackend = {
      server: options.server,
      apiKey: options.apiKey,
    };

    addServerHandler({
      middleware: true,
      handler: resolver.resolve("./runtime/server/middleware/proxy"),
    });
  },
});
```

```ts
// my-backend-integration/src/runtime/server/middleware/proxy.ts
import {
  defineEventHandler,
  getRequestURL,
  getRequestHeaders,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
  send,
} from "h3";
import { useRuntimeConfig } from "nitropack/runtime";

export default defineEventHandler(async (event) => {
  const { server, apiKey } = useRuntimeConfig(event).myBackend as {
    server: string;
    apiKey: string;
  };

  const url = getRequestURL(event);
  if (!url.pathname.startsWith("/api")) return;

  const targetUrl = `${server}${url.pathname}${url.search}`;

  const headers: Record<string, string> = {
    ...(getRequestHeaders(event) as Record<string, string>),
  };
  headers["Authorization"] = `Bearer ${apiKey}`;
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

Use it in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ["./my-backend-integration/src/module"],
  myBackend: {
    server: "https://api.myservice.com",
    apiKey: process.env.API_KEY ?? "",
  },
});
```

---

## Common patterns

### Token auth (JWT Bearer)

On each request, read the Mapo session token from cookies and forward it as an `Authorization` header:

```ts
import { parseCookies } from "h3";

const cookies = parseCookies(event);
if (cookies.__mapo_session) {
  headers["Authorization"] = `Bearer ${cookies.__mapo_session}`;
}
```

### Custom path rewriting

Apply regex rewrites before forwarding:

```ts
const rewrites: Record<string, string> = {
  "^/api/auth/login": "/auth/token/",
  "^/api/profiles/me": "/users/me/",
  "^/api": "/v1",
};

let rewrittenPath = url.pathname;
for (const [pattern, replacement] of Object.entries(rewrites)) {
  if (new RegExp(pattern).test(rewrittenPath)) {
    rewrittenPath = rewrittenPath.replace(new RegExp(pattern), replacement);
    break;
  }
}

const targetUrl = `${server}${rewrittenPath}${url.search}`;
```

### Response transformation

When you need to reshape the backend response to match Mapo's expected format (e.g., `{ results, count }` for paginated lists):

```ts
const response = await fetch(targetUrl, { method, headers, body });
const json = await response.json();

// Backend returns { items, total } — Mapo expects { results, count }
const transformed = { results: json.items, count: json.total };

setResponseStatus(event, response.status);
setResponseHeaders(event, { "content-type": "application/json" });
return send(event, JSON.stringify(transformed));
```

### Login/logout cookie management

If your backend sets a session cookie on login, alias it as `__mapo_session` so `useAuthStore` and the `@mapomodule/core` init plugin can pick it up:

```ts
// After a successful login response:
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

---

## Checklist for a complete integration

- [ ] Path rewrite: `/api/auth/login` → backend login endpoint
- [ ] Path rewrite: `/api/auth/logout` → backend logout endpoint
- [ ] Path rewrite: `/api/profiles/me` → backend user-info endpoint
- [ ] On login response: alias backend session cookie as `__mapo_session`
- [ ] On logout response: clear `__mapo_session` cookie
- [ ] Forward `X-CSRFToken` or equivalent CSRF mechanism if required
- [ ] Filter sensitive cookies before forwarding to the backend
- [ ] Store backend URL in `runtimeConfig` (server-only, never `runtimeConfig.public`)

---

## Connecting with `@mapomodule/core`

Once your integration proxy is in place, `@mapomodule/core` works without modification:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["mapomodule", "./my-backend-integration"],
  mapo: {
    authLoginUrl: "/api/auth/login", // rewritten by your proxy
    userInfoApi: "/api/profiles/me/", // rewritten by your proxy
    logoutUrl: "/api/auth/logout", // rewritten by your proxy
  },
  myBackend: {
    server: "https://api.myservice.com",
  },
});
```

`useCrud`, `useMapoAuth`, route middleware, and SSR hydration all work unchanged — the proxy is the only thing that knows about the specific backend.

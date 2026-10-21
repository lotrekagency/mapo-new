# Platform and environments

Configuration, environments, and the integrations that run on every page. Read it before
touching env vars, the build configuration, analytics, monitoring, SEO plumbing or
caching, and whenever something works in one environment only.

## Contents

1. Know your environments
2. Build time vs runtime
3. Gate on the environment name, never on the build mode
4. Trusted hosts and forwarded headers
5. Analytics, pixels and consent
6. Error monitoring
7. SEO plumbing
8. Caching
9. Secrets and keys

---

## 1. Know your environments

Keep a table in the operating manual with one column per environment (develop, preview,
staging, production). For each one, give the frontend host, the legacy host if there is
one, the backend, and the value of the environment-name variable. Note what differs
between them: the data (local media may be missing), image optimization (often bypassed
in develop), and keys (restricted per host).

## 2. Build time vs runtime

- Server-side environment reads are live, so a restart picks up a change.
- Public variables inlined into the client bundle, and anything the framework bakes into
  its manifest (an allowed-hosts list, for example), are fixed at build time. Changing
  them needs a rebuild.
- Keep one env file per environment as the single source for both phases, and have the
  image build source it before it builds.
- A build run outside the deployment pipeline bakes `undefined` into every public
  variable. That is how a form ends up without its captcha token.
- Read a value that rotates (a map token) at runtime and pass it down, so changing it
  doesn't need a rebuild.

## 3. Gate on the environment name, never on the build mode

Staging and preview run production builds, so the build mode can't tell them apart. Use
an explicit environment name (`PUBLIC_ENV=staging`) that defaults to development when
unset, and gate the integrations on it.

## 4. Trusted hosts and forwarded headers

- A server adapter may refuse the `Host` and `X-Forwarded-Host` headers unless the host
  is on an allowed list. The request URL then falls back to `localhost`, and anything the
  backend builds from the forwarded host (media URLs, canonical links) points there. The
  dev server often skips this code path, so the bug only shows in deployed environments.
- Forward the host to the backend explicitly, and keep an allowed list per environment:
  the exact host for previews, a wildcard for staging if needed, and the real domains in
  production.

## 5. Analytics, pixels and consent

- Load them in production only, server-rendered, respecting Do Not Track and consent.
- Keep the event names that the tag container's triggers use as a contract, even if they
  look legacy. Drop fields that nobody reads.
- Push form events only after the backend accepts the submission, and without personal
  data.
- Click-tracking ids come from the link component, not from each page.

## 6. Error monitoring

- Start with production only, errors only, no personally identifiable data, and no trace
  sampling until there is a reason for it.
- Prefer server-side reporting when past incidents were server-side and the bundle
  budget matters. Add client reporting when client errors become a real class of
  problem.
- On the first production deploy, check that the events arrive.

## 7. SEO plumbing

- Canonical and hreflang links come from the record's alternates, and `noindex` from the
  record's flag.
- Each page has one URL. Without a trailing-slash policy and a redirect, every page has
  duplicates.
- Decide who serves robots and sitemaps (often the backend), and route them in the
  proxy.
- Negotiate the locale on the bare root with a temporary redirect. A permanent one pins
  the first visitor's language in browsers.
- Leave prefetching and critical-CSS extraction off unless measurements justify them.

## 8. Caching

- Put the cache behind an async interface, so that a shared store can replace memory
  without touching the callers.
- The key must include everything that changes the response: the URL, the locale, the
  forwarded host (otherwise one wrong host poisons the absolute URLs for everyone), and
  the request body for POSTs.
- Preview mode and editor sessions bypass the cache.
- Turn it on after the switch, once there are traffic numbers.

## 9. Secrets and keys

- Never copy secrets from env files into code, docs or messages. If you need to know
  whether two differ, compare their hashes.
- Public keys (captcha site keys, map tokens) are public by design, but they still belong
  to an account. A token from someone's personal account is a configuration debt:
  record it.
- Third-party keys restricted by IP or referrer explain most cases of "it only works in
  one environment".

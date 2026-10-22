# Replacing a legacy frontend

How to replace an existing frontend one page type at a time, without a big-bang switch.
Read it when the project has an old frontend that still serves users, or when you port
any behaviour from one.

## Contents

1. The strategy
2. Reproducing the routing model
3. Porting a page type
4. What to port and what not to
5. Platform parity
6. The switch and the rollback
7. Things that depend on the legacy

---

## 1. The strategy

- Both frontends run side by side against the same backend: the new one on the main
  endpoint, the old one on another port or host. The backend and the editors' tools stay
  as they are, apart from the fields the new design needs.
- The new frontend reproduces the legacy routing model exactly, so migrating a page type
  means adding one registry entry.
- Page types that aren't migrated yet render a raw fallback view (a payload dump). The
  new site stays navigable throughout, and every page type is an independent,
  reviewable unit.
- Parity is tracked on two levels: page types (in their docs and a status table) and
  platform features (in a parity doc).

## 2. Reproducing the routing model

- A single catch-all route resolves every URL through the backend. The record type plus
  its template code selects the view.
- The entry point owns locale parsing and the single fetch (see
  [data-layer.md](data-layer.md) §2).
- Every migrated view is registered in one registry. An unregistered code falls through
  to the fallback view. That fallback is better than borrowing a view built for a
  different content shape.
- When the spec says two record types behave the same, they share one view, registered
  under both.

## 3. Porting a page type

1. Read the legacy view and its components for their rules: visibility conditions,
   fallback chains, derived values, in-page anchors, analytics events, translation keys.
2. Find the contract (see [sources-of-truth.md](sources-of-truth.md) §4), and capture a
   real payload.
3. Write the mapper, with a `Legacy:` comment on every ported rule.
4. Build the view and its components on the reuse ladder, then register the view.
5. Write the feature doc, with the mapping table and the open points, and update the
   status table.
6. When the rules depend on the locale, check more than one locale.

## 4. What to port and what not to

- **Port** the rules users rely on, stored links and anchors, translation keys, and the
  analytics names that dashboards or tag triggers use as a contract. When hundreds of
  stored records link to an in-page hash, answer that hash, as an alias if needed.
- **Port deliberately, even if it looks odd**, any quirk that changes what the backend
  receives (a form that never sent a field). Keep it until someone decides otherwise,
  and note it.
- **Don't port** markup, data leaks (such as typed form fields sent to analytics), or
  dead features that no design draws (map those as removal candidates).
- **Record agreed regressions** (a map dropped on mobile) as decisions, so nobody
  "fixes" them back.
- Where the legacy and the new design disagree on the look, the design wins. On the
  rules, the legacy wins until someone decides otherwise.

## 5. Platform parity

Go through this checklist before the switch. The details are in
[platform-and-environments.md](platform-and-environments.md).

- locale negotiation on the root (a 302 with `Vary: Accept-Language`, q-values honoured),
  a 404 on paths without a locale, the default locale;
- the trailing-slash policy: one canonical form, with a redirect from the other;
- canonical links, hreflang alternates, `noindex` for records that aren't indexable, and
  who serves robots and sitemaps;
- the favicon and touch icons;
- analytics and pixels: environment gating, consent and Do Not Track, the event names the
  tag container expects;
- error monitoring;
- forms: captcha keys, endpoints, analytics on success;
- caching and its keys;
- the image optimization path.

Decide the order of the remaining items with the user, and record it.

## 6. The switch and the rollback

- The switch is a reverse-proxy upstream change. Keep the legacy service defined, but
  commented out, in the production configuration, and write the rollback steps in the
  operating manual.
- Monitoring matters most at the switch, so put error reporting in place before it.
- Caching waits for real traffic numbers.

## 7. Things that depend on the legacy

Before renaming or moving the legacy frontend, list everything else that uses it:

- other sites that import its code, and the container paths they expect;
- container names that other services call (an editors' tool that triggers a static
  build by container name);
- ports in proxy configs.

Keep those contracts intact, and list them in the root agent file under the things that
are easy to break.

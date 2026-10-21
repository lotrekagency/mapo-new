# The data layer

How backend data becomes the frontend's typed model. Read it before writing a mapper, a
fetch, a mock, or anything that touches the shape of the data.

## Contents

1. Three layers
2. Who fetches
3. The mapper
4. Fail-soft rules
5. Mock-first or straight to live
6. The skeleton stage
7. Integration
8. Reporting gaps
9. State in the URL
10. Product apps

---

## 1. Three layers

| Layer | Knows | Never knows |
|---|---|---|
| Transport | HTTP, endpoints, headers, caching, error handling | Rendering, page types |
| Mapper | Backend shapes and the frontend model | Markup, CSS, fetching |
| Components | The typed frontend model | Backend shapes, endpoints |

With this split, backend drift is fixed in one file, and a component written against a
mock survives the switch to live data untouched.

## 2. Who fetches

- One entry point per request (a middleware, a route loader, a server handler) fetches
  the resource being rendered. It fetches the chrome data (menus, labels) in the same
  parallel batch and exposes everything to the view. Nothing else fetches that data.
- Views map and compose. They don't fetch the resource again, and they don't parse
  routing concerns such as the locale, because the entry point already did.
- The exception is a list driven by the request's query, such as search results or a
  filtered or paginated listing. Its view fetches it through the transport, with a
  fail-soft path: an empty state, or the filters dropped.
- Don't add a second loading mechanism (a content collection, a client store) for data
  the entry point already has. It re-fetches the page being rendered.
- Forward what the backend needs from the original request: the host, language headers,
  and preview cookies. Always forward the host when the backend builds absolute URLs
  from it.

## 3. The mapper

Write one file per page type or feature, top-down:

1. **The frontend model**: what components consume, and nothing more. Every block
   carries a common base (`isActive`, plus a `navLabel` where the page has an index).
2. **Derived navigation** (an in-page index, breadcrumbs): built *last*, from the blocks
   that survived mapping, never from a backend list of active sections.
3. **Backend types**: a faithful mirror of the schema. Make every field optional and
   nullable unless the backend truly guarantees it.
4. **Helpers, then one `map<Block>` per block.**
5. **The exported `map<Page>(record, t, locale)`**, which ends with
   `return { ...data, pageNav: buildPageNav(data) }`.

Inside the mapper:

- **Presentation constants the backend doesn't send** (layout choices, anchors, section
  titles, animation knobs) are named constants in the mapper. That gives one tuning point
  per page instead of magic numbers spread through CSS and components.
- **Copy goes through `t`**, passed in as an argument. Mappers never import
  dictionaries, so they stay pure and testable.
- **Shared mapping primitives** (media, links and calls to action, titles, rich text,
  breadcrumbs, social links) live in one module. Never re-implement them per page; when a
  second page needs a helper, move it there.
- **Legacy rules** carry a `Legacy:` comment, because they are what silently gets lost in
  a rewrite.
- **Optimistic reads.** When a field is agreed but not shipped yet, read it through a
  fallback chain (`sub.permalink ?? sub.slug`). The feature lights up the day the
  backend ships it, with no component change. List it as an open point.
- **Field roles over field names.** Map content by the role it plays in the design. A
  field called `title` may hold the claim while the section heading is a label. Note
  it in the feature doc so nobody "fixes" it.
- **Shared types.** A shape used by more than one mapper goes to the shared types module,
  re-exported from the mapper for compatibility. Presentational unions (variants) stay
  in their component.
- **Code that runs on both the server and the client** (re-mapping results after a
  client-side search) takes resolved labels as data. It can't take the translation
  function, which usually exists only on the server.

## 4. Fail-soft rules

- An absent or null field becomes `undefined`, and the component skips that element.
- `isActive = enabled !== false`, plus an emptiness test where an empty block is
  meaningless (`&& items.length > 0`).
- A half-filled record renders. An empty one renders the page's empty or fallback state,
  never an exception.
- An element that exists only to link somewhere (a card, a menu row, a "read more") is
  omitted when it has no destination. A designed call to action whose link isn't
  configured yet may render with a placeholder (`href="#"`) while data entry catches up.
  Decide this policy once per project and record it.
- Don't invent a fallback that hides a data-entry gap the editors should fix, such as an
  index entry that falls back to the section title when its label is empty. Report the
  gap instead, unless the user asks for the fallback.
- Be wary of flags with defaults. A boolean saved as `true` on every record because of
  a form default is not a signal, even if the backend sends it.
- Don't drop a block because it is empty in the data you are looking at. An empty block
  may be a data-entry gap on a feature that works.

## 5. Mock-first or straight to live

| | Mock-first | Straight to live |
|---|---|---|
| When | The backend contract doesn't exist yet | The schema exists and data is populated |
| How | A backend-shaped fixture at the mapper **input**, short-circuited in the transport for the dev route | Mock only the fields the design adds that the backend lacks |
| Cost | A mock to build and later delete | None: data gaps show up at once, which is useful |

- Never mock the mapper's *output*. A frontend-shaped mock lets the mapper rot and hides
  shape mismatches until integration day.
- Tag everything temporary with one greppable marker, `TEMP(<feature>-<purpose>)`, so
  the purge is a single search.
- Dev-only assets go in a dev folder and leave with the mock.
- Switching from the mock to live data must not touch a single component.

## 6. The skeleton stage

For a large page, ship the data layer and the chrome first. Use placeholder bodies
(`TEMP(<page>-skeleton)`) that carry the real section ids and anchors. The page is then
navigable, and its index and scroll choreography already work. Each later step replaces
one placeholder with its real component without touching the mapper or the page
structure.

## 7. Integration

1. Diff the real payload against the backend types, block by block. Check the `enabled`
   flags, list lengths, media `type`s, color formats (8-digit hex), links without a
   resolved target, and rich text where you expected plain text.
2. Fix the types or the mapper, never the components.
3. Purge every mock artifact with `grep -rn "TEMP(<feature>"`.
4. Run the gates. Leave the live check (real content, media URLs on the public host,
   labels resolved from the backend) to the review.
5. Refresh the feature doc: the data flow, the per-section mapping table, the open points.

## 8. Reporting gaps

Every gap has an owner, so report it under its owner:

- **Backend fields**: a schema or endpoint must change. Examples are a missing field, a
  mobile crop, a link on a card, a flag the design needs, or a free-text field that
  should be structured.
- **Data entry**: the field exists, but it is empty, inconsistent or wrong in some
  records or locales.
- **Configuration**: keys, env values, third-party settings (an API key restricted to
  another host).
- **Removal candidates**: fields that nothing reads anymore.

Gaps go into the feature doc's open points, in the doc language. When the feature is
done, they also go into the handoff note, in the recipient's language (see
[documentation.md](documentation.md) §8).

## 9. State in the URL

Some state should survive a reload, be shareable, be crawlable or work with the back
button: search terms, filters, pagination, an open panel worth linking to. That state
lives in the URL:

- filters and pages are plain links or a GET form, which a script may enhance;
- an overlay worth linking to opens from a hash, honoured on load and on back/forward.
  It also answers aliases for legacy anchors that stored content still links to.

## 10. Product apps

The same boundary holds when the backend is a product API rather than a CMS:

- Mappers or selectors turn API DTOs into view models, and components consume view
  models.
- Server state (cached API data) and UI state (open panels, drafts, selections) are
  different things with different owners. Don't mirror server data into UI state for
  convenience.
- Validation the backend owns stays server-authoritative. Client checks cover only what
  the backend can't judge, such as a consent tick.
- User-generated content is untrusted input. Unlike editor copy, it is always escaped or
  sanitized (see [content-and-i18n.md](content-and-i18n.md) §4).
- Long-running and optimistic interactions need explicit failure paths (a rollback, an
  error state). Describe them in the feature doc like any failure path.

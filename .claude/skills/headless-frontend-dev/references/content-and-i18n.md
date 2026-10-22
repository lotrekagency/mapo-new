# Content, labels, links and media

What the frontend owns, and what it only displays. Read it before printing any text that
comes from data, adding a label, rendering a link or a media, or formatting a date.

## Contents

1. Content vs labels
2. Don't reshape content you don't own
3. Titles and highlights
4. Trusted and untrusted HTML
5. Translations
6. Links and calls to action
7. Media
8. Dates, times and numbers

---

## 1. Content vs labels

- **Content** (titles, paragraphs, media, calls to action) comes from the data. Editors
  or users write it and translate it.
- **Labels** (buttons, chips, aria labels, empty states, form copy) go through the
  translation function, with a default in the project's source language.
- Neither components nor mappers hold hardcoded copy, and that includes aria labels.

## 2. Don't reshape content you don't own

The text, its length and its markup can change per locale and per edit, on any day. So:

- Don't add `\n` or `<br>` to reproduce a design's line breaks. Constrain the width (in
  `em` or `ch`), set target line counts, and let the text wrap.
- Don't extract, truncate, split or clean editor HTML. If the design shows a claim above
  a paragraph, the claim is the copy's own first bold run or heading, and CSS styles it
  (`p:first-child strong`). Editors make it bold on purpose.
- Measuring is allowed; rewriting is not. Choosing a layout from the plain-text length
  is fine, for example a centred column up to a set number of characters and two columns
  beyond it. Keep the list of agreed measuring exceptions in the project docs. Nothing
  else touches the text.
- When editor HTML differs structurally between locales, style it by element kind (the
  first heading, the image, a button-like link) instead of parsing it.
- Clamping copy with CSS hides text that editors wrote. Do it only where the design and
  the user agree, never by default.
- Why: a parser breaks silently on copy written slightly differently, and a fixed break
  breaks every other text. A text's structure and length are editorial decisions.

## 3. Titles and highlights

- Normalize editor artifacts in one helper that every title goes through: real newlines,
  a literal `\n` typed in a field, typed `<br>` tags. Titles print as text.
- A highlight that arrives as a separate field wraps the first case-sensitive occurrence
  in the title. Partial words are legitimate. With no match, the title prints plain.
- Reproduce a design's line layout with width limits, target line counts and measured
  offsets, never with breaks.

## 4. Trusted and untrusted HTML

- Decide the policy per source, and record it in the decision register.
- Editor copy behind authentication (CMS content, translation overrides editable in the
  editors' tool) is commonly accepted as trusted HTML and printed as saved. In that case:
  - don't add per-component sanitizers during reviews;
  - if it is ever hardened, harden it in one place (where content is built), with an
    allowlist;
  - reopen the decision if more people get edit rights;
  - remember that link `href`s pass through as well, including a `javascript:` URL typed
    into a static link field.
- Visitor and user-generated content is never trusted. Escape it, or sanitize it with an
  allowlist at one boundary.
- A value interpolated into an inline script always goes through a JSON-safe serializer
  that escapes `</script>` and similar sequences.

## 5. Translations

- A key reads `Domain/Short description`. Its value is the default in the source
  language, and placeholders are written as `{param}`.
- Reuse existing keys before creating new ones. That covers legacy keys, spelled
  identically (a typo creates a new, untranslated term), and any already-translated key
  with the same meaning. Check the stored value as well as the default, because a key
  edited for another context may no longer fit.
- If the new copy differs from a reused key's value, reuse the key anyway and flag the
  drift in a comment. Editing the value changes every page that uses it, the legacy
  ones included.
- When the backend registers unknown keys automatically, a new key appears for
  translators on its first request. List the new keys in the report.
- Values may come back HTML-escaped. Decode them once, in the translation function, so
  labels print as plain text. Never patch an apostrophe by printing a label as raw HTML.
- `t` exists where labels are resolved, usually on the server. Mappers receive it as an
  argument, and client scripts receive resolved labels through `data-*` attributes.
- A translated value may legitimately be a URL or a URL fragment.
- Per-locale assets (store badges, localized pictures) are content too. Plan them instead
  of shipping one locale's file to every locale.

## 6. Links and calls to action

- Every data-driven link goes through one resolver component. It turns internal
  references into localized paths, keeps static paths as written, marks external URLs
  and handles same-page hashes. If the project tracks clicks, it also emits the
  analytics ids.
- Never hardcode hostnames.
- To open an overlay from content, link to its hash with a plain anchor.
- The policy for unconfigured links is in [data-layer.md](data-layer.md) §4.

## 7. Media

- Media come in desktop and mobile versions: `ResponsiveMedia { desktop?, mobile? }`,
  where mobile falls back to desktop. Wire both slots everywhere, even where the backend
  has a single field today. In development, point mobile at the desktop file until the
  dedicated crop exists.
- Everything renders through one media component. It picks the crop per breakpoint and
  dispatches image, video or carousel. The only raw exception is a glyph icon that has no
  data field.
- Media never belong to the frontend: they come from the data source. The repository
  holds only decorative system assets, plus dev placeholders queued for removal.
- Respect the loading budget:
  - images upgrade as they approach the viewport, and only the visible crop is fetched;
  - background videos never `autoplay` or `preload="auto"`, because both crops are in
    the DOM. A poster or the first frame shows, and an observer plays and pauses them;
  - a background loop plays a short preview cut, and the full clip plays on demand in a
    video dialog;
  - a sequence that pins the screen owns its videos, and the generic observer skips them;
  - only above-the-fold media get loading priority.
- A content video (in a box, a tab or a carousel) opens its full clip on click. A
  background under copy and buttons doesn't.
- Icons that editors upload (social profiles, brands) render as uploaded. If the design
  draws them differently, the fix is to upload different files.
- A media component's scoped size rules beat a class you pass to it. Wrap the component,
  or style it from a global sheet with matching specificity.

## 8. Dates, times and numbers

- Format instants in the business's timezone, not the visitor's browser zone, unless the
  product says otherwise. Derive daylight-saving labels from the date itself.
- Format dates and numbers with the locale's rules. Month names and separators are not
  copy to hardcode.

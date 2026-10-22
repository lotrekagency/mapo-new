# Styling

The conventions that keep styles predictable across many pages, and the traps that cost
real time. Read it before adding a stylesheet, a token or a type style.

## Contents

1. Layering
2. Tokens
3. Typography
4. Responsiveness
5. Following the design
6. Traps
7. Checks

---

## 1. Layering

- Keep the global foundation minimal: a reset, the tokens, the type scale, and the
  helpers (mixins or utilities).
- By default, styles are scoped and live next to their component.
- Some rules need a global component sheet, because scoping can't reach them:
  - classes handed to a child component, since the child's root doesn't carry the
    parent's scope;
  - HTML injected from data;
  - shared blocks that several wrappers style.
  Import all of them from one entry sheet. Order matters when one sheet overrides
  another.
- Leave no scope-escape wrappers (such as `:global(...)`) in component files. Move those
  rules into the component's global sheet without the wrapper. Scoping syntax that
  reaches a global sheet verbatim is invalid CSS, and the browser drops the whole rule
  (watch the build warnings).
- Don't introduce a CSS framework or a new styling system in the middle of a project
  unless that is decided and recorded.

## 2. Tokens

- Visual tokens (colors, surfaces, borders, easings, durations) are CSS custom
  properties, so they can change at runtime and support theming.
- Compile-time values (breakpoints, the type scale) stay in the preprocessor or the build
  config.
- A literal that recurs becomes a token once it is stable. Two names for one design
  color is a debt: record it as an open thread.

## 3. Typography

- Every text style is a role (`display-hero`, `title-md`, `body-base`, `label`,
  `action-sm`, ...) applied through one helper. Never repeat family, size and line-height
  by hand.
- An override that recurs becomes a new role.
- Constrain text width in `em` or `ch`, so wrapping follows the type and not the
  viewport.

## 4. Responsiveness

- Mobile-first. Breakpoints only through helpers (`media-up`, `media-down`), and the docs
  name the breakpoint that counts as desktop.
- Size full-screen sections in small-viewport units (`svh`), so the mobile browser's
  toolbars don't make them jump, and ignore height-only resizes on touch devices.
- Cap listing content at a maximum width. Full-bleed media are not capped.
- No horizontal overflow: on a real device emulation,
  `document.documentElement.scrollWidth === clientWidth`. The usual cause is a long
  unbreakable string, such as a URL in debug markup. On mobile, overflow zooms the
  viewport out until fixed elements fall off the screen.

## 5. Following the design

- When the design's declared values disagree with what it visibly renders, follow the
  render. A border declared at 60% black that shows as a faint hairline is a hairline.
- A section boundary is a visual fact (a background that runs without a break), not a
  backend fact. Two backend blocks can form one section, and one block can form two.
- Translucent surfaces over decorative backgrounds (a light wash plus a backdrop blur) let
  the decoration read through. Decide the recipe once and reuse it.
- An effect built from blend modes and blurs in the design tool gets baked into one
  asset, and instances differ only in placement. The host isolates and clips it, and
  fades it out before its edge so section seams don't show.

## 6. Traps

- `[hidden]` loses to an authored `display`. Force it in the reset, and add
  `&[hidden] { display: none !important }` to components that set `display`.
- `backdrop-filter` (like `filter`, `transform` and `opacity < 1`) creates a stacking
  context, so a dropdown inside it paints under the next sibling. Lift the parent, for
  example with `:has()` and a `z-index`.
- A `z-index: -1` decoration needs `isolation: isolate` on its host, or it slides behind
  the host's background.
- Whitespace between inline elements written on separate lines only renders if the HTML
  minifier keeps it. Changing the minifier mode needs a visual pass.
- A global rule that overrides a scoped component rule needs at least the same
  specificity (`img.media-image`, not a bare `img`).
- Injected HTML needs a global sheet, and usually a "flow" helper for spacing and list
  markers.
- A hover-only affordance needs a focus equivalent and a decision for touch devices.

## 7. Checks

- Look at both breakpoints of every changed block, and at a locale with long copy.
- Check reduced motion as well (see [motion.md](motion.md) §8).
- The CSS pipeline must print no new warnings during the build.

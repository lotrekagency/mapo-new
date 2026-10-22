# Motion

How to choose an animation mechanism, how to keep scroll-driven work cheap, and the
reduced-motion contract. Read it before adding anything that moves.

## Contents

1. Pick a mechanism, don't invent one
2. Scroll-driven choreography
3. Transitions between screens
4. Text and media stages
5. Overlays and nested scrollers
6. Between pages
7. The reduced-motion contract
8. Verifying motion

---

## 1. Pick a mechanism, don't invent one

| Need | Mechanism |
|---|---|
| Plays once when visible | CSS + IntersectionObserver: a `data-reveal` attribute becomes an `is-revealed` class. Stagger it with an index variable, always capped |
| Progress is a function of scroll | The project's single scroll orchestrator: a declarative attribute (`data-anim="<token>"`) plus one behaviour factory per token |
| Replays on show and hide | A plain CSS animation on `:not([hidden])`, which restarts each time the element goes from `display: none` to visible |
| Pointer micro-interaction | A scoped `requestAnimationFrame` loop, skipped on touch and under reduced motion |
| Moving between pages | Cross-document view transitions, CSS only |
| An entrance on page load | Started when the page loader leaves, or at once when there is no loader |

If a need doesn't fit, extend an existing mechanism (for example, a new behaviour
factory). Don't add a parallel system.

## 2. Scroll-driven choreography

- One orchestrator owns pins and scrubs. It boots once per page and tags the root
  (`.js-scroll`), so CSS can keep a fallback under `:not(.js-scroll)` for anything a
  behaviour replaces.
- There is one frame loop. Subscribe to it; never add another `scroll` listener.
- Scroll callbacks write and never measure. A `getBoundingClientRect`,
  `getComputedStyle` or `elementsFromPoint` inside one forces layout on every frame. On
  phones, the stutter shows exactly at section boundaries. Measure when the geometry
  changes (resize, font load, pin refresh), store the results in a cache that accounts for
  pin spacers, and read from the cache.
- Keep frames cheap. Quantize values (to 1/1000) and write only when they change.
  Animate `transform`, `translate`, `scale` and `opacity`, and nothing that triggers
  layout.
- A behaviour's knobs (fade windows, distances, curves) are named constants at the top of
  the behaviour, each documented with what it changes.
- Smooth-scroll libraries run only on fine pointers (`(hover: hover) and (pointer: fine)`).
  On touch they cost main-thread time and add nothing. Programmatic scrolls go through one
  helper that knows about the library.
- A wrapper that groups sections (so a sticky element can span them) must stay
  transparent to the page geometry. Mark it, so the list of page sections still sees its
  children.
- To add a behaviour: write the factory, register it, add the attribute in the markup,
  write the CSS fallback, document it.

## 3. Transitions between screens

- Keep a small, fixed vocabulary. For example, *cover* (the next screen scrolls over the
  pinned current one) and *uncover* (the current screen scrolls away over the next one,
  already at rest). Don't invent a third gesture: the site should have one feel.
- Screen transitions are for screens people look at, not for content they read. Pinning
  a reading section feels like the page freezing mid-paragraph.
- Use them on every section of a page or on none. The one agreed refinement: a page that
  opens on a full-screen picture may pin only that picture under its content.
- After a cover, the covered screen stays behind the rest of the page. Every following
  block needs a positioned, opaque background from edge to edge, because margins are
  never painted.

## 4. Text and media stages

- Text stages swap discretely. The scroll picks the active stage at a threshold, and the
  fade itself is time-based CSS (out fast, in slower, after a short delay). A scrubbed
  text cross-fade leaves two texts half-blended whenever the user stops scrolling.
- Media may stay scrubbed.
- A zoom across stages steps geometrically, `from·(to/from)^(i/(n−1))`, with a CSS
  transition at each threshold. A continuously scrubbed full-screen `scale` re-rasterizes
  on every frame. Check the upscale factor against real images, which may pixelate.
- Staggers always cap their index (`min(var(--i), 11)`), because real lists run to
  dozens of items.

## 5. Overlays and nested scrollers

- An overlay takes both halves of the lock: the reference-counted page scroll lock, and
  the smooth-scroll exemption on its root. Either half alone leaves the page or the
  overlay's own scroller broken. Unlock before a programmatic scroll, because a stopped
  smooth scroller drops it.
- A horizontal row inside the page is a native `overflow-x` scroller plus a wheel
  handler, exempted horizontally from the smooth scroller. Decide wheel ownership once
  per gesture (the page is at rest, the row has room left in that direction, the row
  actually moved), so a row can never trap the page.
- When the wheel drives a row, snap it with `proximity`, never `mandatory`: with
  `mandatory`, a single notch bounces back.

## 6. Between pages

- Prefer native cross-document view transitions to a client-side router. Every
  navigation stays a full page load, so no script has to become re-entrant.
- An element that persists across pages (the header) keeps a view-transition name that no
  other element uses, or the browser skips the transition. Drop the name while an
  overlay covers the element.
- A loader for loads without a transition is shown only by its own inline script. If
  markup alone showed it, visitors without JavaScript would see it forever. Hold it for a
  minimum time and cap it at a maximum.
- Reduced motion and unsupported browsers get a plain navigation.

## 7. The reduced-motion contract

`prefers-reduced-motion: reduce` removes motion, never content.

- Static fallbacks show every text and every media. A typical fallback is a sticky
  backdrop of the first media with a veil, and the stages stacked over it. Add
  fallback-only markup where a stage's media would otherwise never appear.
- Only scroll-driven decoration may hide: a drifting light, a scroll hint, later stage
  layers over a backdrop.
- Videos never start, but their first frame is visible (`preload="metadata"` or a
  poster).
- Why this is a hard rule: the operating-system setting is common (people turn it on to
  speed up window animations). With it on, the engine correctly doesn't boot, so a
  fallback that hides media makes the site look broken, with a clean console. No
  developer without the setting will ever see the bug.
- The no-JavaScript path is separate, and it must stay readable too.

## 8. Verifying motion

- For every animated section, use DevTools → Rendering → *Emulate CSS
  prefers-reduced-motion* and check both modes. If you can't run a browser, list the
  sections in the report for the reviewer.
- To match a reference recording, extract frames
  (`ffmpeg -i reference.mov -vf fps=10 frames/%04d.png`) and compare the timing and the
  rest states.
- When "nothing works on some devices" and the console is clean, ask about accessibility
  and power-saving settings before hunting through the code.

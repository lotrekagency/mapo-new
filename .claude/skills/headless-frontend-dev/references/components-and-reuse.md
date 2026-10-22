# Components and reuse

How to choose between using, extending and creating a component, and the patterns that
keep a growing set of pages cheap. Read it before writing any component.

## Contents

1. Read the catalogue first
2. The reuse ladder
3. Extending without bloating
4. Promoting a component
5. The generic section and its presets
6. Generic modules own behaviour, not geometry
7. Composed pages: one thin wrapper per block kind
8. Layout chrome vs page furniture
9. Overlays
10. Forms
11. Navigation
12. How heavy a mechanism to use
13. Accessibility and the no-script path

---

## 1. Read the catalogue first

The project's component catalogue lists every primitive with its props, its users and its
trade-offs. Read it before creating anything, because most new sections turn out to be a
thin wrapper over something that exists. A new reusable component gets its catalogue
entry in the same step.

Folders to look for, or to set up: template-agnostic primitives (`ui/`), site-wide
furniture (`shared/`), page chrome (`layout/`), and one folder per feature for the
sections bound to a page type.

## 2. The reuse ladder

Stop at the first rung that works.

| # | Rung | What it looks like | When |
|---|---|---|---|
| 1 | Use as-is | `<Media media={hero.media} />` | The primitive already does it |
| 2 | Use with a preset | `<Section {...presets.intro} ... />` | The layout differs, the behaviour doesn't |
| 3 | Thin wrapper | about 20 lines mapping data onto a primitive | Most sections |
| 4 | Extend | an orthogonal prop on the primitive | Two callers need the same knob |
| 5 | Compose | primitive + primitive + a little glue | A new arrangement of known parts |
| 6 | Create | a new component | A genuinely new mechanism |

## 3. Extending without bloating

- Add orthogonal props: independent knobs that existing callers simply don't pass
  (`subject`, `action`, `align`, `controlsBelow`). Never add a page-named mode
  (`variant="productPage"`) that bundles unrelated differences.
- When callers need different content in the same place (`head`, `intro`, `controls`,
  `after`), a slot beats a flag.
- When you change a shared component for one page, the other pages change with it. List
  them in the report so the reviewer checks them.

## 4. Promoting a component

- A component becomes shared when a second user appears, not before. With one user it
  stays in its feature folder.
- To promote one, move it to the shared folder under a generic name and turn the first
  user into a thin wrapper. Move its styles to the shared sheet, and check that the first
  page renders the same before and after.
- Record the promotion in the catalogue, and in the decision register if it is
  structural.
- When the second user still keeps a copy of the geometry, list the copy as an open
  thread and remove it in a separate `refactor` commit.

## 5. The generic section and its presets

A full-bleed section component carries most content pages. It has a media layer, an
overlay, an index, a title, a paragraph, badges, a call to action, and a slot for
floating furniture.

- Presets hold layout only, one named preset per design block, all in one file. Content
  always comes from mapped data.
- Override a prop inline only where the design really diverges. A third override on the
  same preset means a new preset.
- Never put a `z-index` on a section that takes part in a stacking choreography. Covered
  and covering sections must stay on the same level.
- An opening screen with complex choreography is its own orchestrator, not a section
  with options.

## 6. Generic modules own behaviour, not geometry

A generic module (tabs over panels, a carousel, an accordion) owns its markup, its ARIA,
the keyboard handling, the switching and the no-script fallback, and no geometry at all.
Every part carries both a generic class (`tabbed-panels__tab`) and a block class
(`<block>__tab`), so each wrapper lays the module out from its own sheet. Per-item extras
come in through a callback or a slot. A new tabbed block is then one wrapper and one
sheet.

## 7. Composed pages: one thin wrapper per block kind

When editors compose a page from blocks in any order:

- write one thin wrapper per block kind, which maps props and sets a root class but adds
  no markup of its own, and dispatch them all from a single block switch;
- give the block models the common base (`isActive`, the nav label), so the in-page index
  is derived from what actually rendered;
- resist bespoke per-page layout components, which are what makes composed pages
  expensive;
- let another page type that draws the same blocks reuse the same wrappers.

## 8. Layout chrome vs page furniture

- Stateless chrome (the header, the footer, global overlays, a contacts panel) belongs in
  the layout and is mounted once.
- Furniture that needs page data (an in-page index bar, breadcrumbs, a scroll hint with
  labels) belongs in the page view. A page that doesn't need it simply doesn't mount it.
- A reduced chrome for landing pages is a layout option, not a copy of the layout.

## 9. Overlays

- Two geometries need two primitives: a centred dialog for media (galleries, video) and a
  full-height side panel against the edge for long copy and forms. Don't merge them.
- Every overlay handles focus, `Escape`, the scrim click, the scroll lock and the
  smooth-scroll exemption on its root (see [motion.md](motion.md) §5). It takes the
  reference-counted lock only on real state changes.
- An overlay worth sharing opens from a hash, plus any aliases.
- A closed `<dialog>` has no size, so anything measured inside it (a carousel) measures
  again on open.
- To place something above fixed chrome from inside a stacking context, use the top layer
  (a popover or a dialog), not a higher `z-index`.

## 10. Forms

- A form is data. One engine renders any form from a spec, and the spec is built by pure
  functions, one per backend form type. Adding a form type never adds a component.
- Validation is server-authoritative. Post the form, read the field keys of the error
  response, and render your own copy for them. The only client-side gates are checks the
  server can't judge, such as a mandatory consent tick.
- The payload is the form element itself (`new FormData(form)`). Every control is a real
  named input, including a hidden input behind each custom dropdown, so there is no
  parallel state object to fall out of sync.
- Build the spec on the server, where the labels are, and pass it in. The browser patches
  only what depends on the visitor: geolocated results, query pre-fills.
- Fire analytics events after the backend accepts, with identifiers only and never the
  typed values.
- Load third-party scripts (a captcha, a maps API) on first need, not on every page.
- Reproduce a legacy quirk that changes what the backend receives until someone decides
  otherwise, and confirm before "fixing" it.

## 11. Navigation

- Server-render the whole menu, with its panels `hidden`, and drive it with attributes
  (`data-level`, `data-open`). The links stay crawlable and no level needs a fetch.
- Never wrap hidden panels in containers that stay laid out, because they swallow clicks.
- Reset the menu state on open, not on close. Otherwise the user sees the reset as the
  menu closes.
- Hover previews react to pointer and focus alike. A missing preview falls back to the
  global default, never to a parent's image, which would read as belonging to the
  hovered row.
- When a data source is special (a catalogue served as if it were a menu), handle that in
  its mapper and nowhere else.

## 12. How heavy a mechanism to use

- Default to server-rendered components with a small, framework-free script for
  interactivity.
- Use a reactive component framework only where reactive state justifies its runtime: a
  form engine, or a results list and a map that share a selection. Hydrate it as late as
  its use allows.
- Prefer platform features to libraries: CSS scroll snap over a carousel library;
  `<details>`, `<dialog>` and popovers over custom state machines; cross-document view
  transitions over a client router.
- Before adopting an engine for a whole class of behaviour (scroll choreography, smooth
  scrolling), spike it and get the decision approved. From then on it is the only owner
  of that behaviour.

## 13. Accessibility and the no-script path

- Each interactive pattern follows its ARIA pattern. Tabs use a roving tabindex with
  arrow, Home and End keys; dialogs trap focus and return it on close.
- When the design shows something other than the heading as the visible title (a claim
  above the content), keep a real heading for the structure, visually hidden if needed.
- The no-script path stays readable. Tabs show every panel, hover interactions also work
  on focus, and no content sits at opacity 0 waiting for a script.
- Labels for icons and controls go through the translation function, like any other copy.

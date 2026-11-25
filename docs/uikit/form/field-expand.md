# Field Expand

A field with `expandable: true` can open in a full-screen panel, in a group or among the fields with no group. Useful for textareas, rich-text editors, maps — anything that benefits from more vertical space without the user having to leave the form.

## TL;DR

```ts
{ key: 'content', type: 'editor', expandable: true }
```

Click the ↔ icon in the field label → the field opens in a fullscreen panel and takes the entire viewport height.

---

## How to: enable it on the right fields

```ts
const fields: FieldDescriptor[] = [
  {
    key: "content",
    type: "editor",
    label: "Article body",
    expandable: true, // ← enables the expand button
    group: "Page",
  },
  {
    key: "description",
    type: "textarea",
    expandable: true,
    group: "Page",
  },
];
```

Recommended targets:

| Field type                 | Expand worth it?                          |
| -------------------------- | ----------------------------------------- |
| `editor` (rich text)       | ✅ always                                 |
| `textarea`                 | ✅ for long-form copy                     |
| `map`                      | ✅ for precise placement                  |
| `repeater`                 | ✅ paired with Focus Mode for inner items |
| `text`, `number`, `select` | ❌ no benefit                             |

## Behavior

When the user clicks the ↔ icon in the field label:

- The field opens in a fullscreen panel (`position: fixed`, with a `1rem` margin), mounted at the end of `<body>`. It has no `z-index`, like Nuxt UI overlays: the select menus, popovers and modals the field opens, and a repeater item opened in [Focus Mode](./focus-mode), show above it. An overlay mounted before the field expanded, such as a `UModal` declared in the page, shows under it: mount that overlay when it opens, with `v-if` or `useOverlay()`.
- A semi-transparent backdrop covers the rest of the page.
- The other fields in the group are hidden.
- The expanded field claims all available height (`flex: 1; min-height: 0`).
- Page scroll is locked until the panel collapses, and until Focus Mode closes too when it was opened from the panel: the lock is counted.

To exit: click the backdrop, press `ESC`, or click the ↙ button in the panel header. `ESC` closes the top layer only: while a select menu, popover or modal opened from the field is open, or a repeater item opened from it in Focus Mode, `ESC` closes that one first.

## Grouped and flat fields

`expandable` works the same on a field with a `group` and on one without: `MapoFormGroup` and `MapoFormFlatSection` (the grid of the fields with no group) both open the panel. A field does not need a group of its own to expand.

## How to: prevent two fields expanding at once

Only one field can be expanded inside the same group. If you have two `expandable` editors in the same group, expanding the second collapses the first automatically.

## Pitfalls

- **Hover-only icon by default** — the icon is hover-revealed to keep the UI clean. While the field is expanded, the icon stays visible to give a clear exit affordance.
- **Page-scroll lock interaction** — an expanded field and Focus Mode lock the page's scroll with one shared counter (`overflow: hidden` on `<html>`), so the page scrolls again only once both have closed. Do not toggle the `overflow` of `<html>` yourself while one is open.

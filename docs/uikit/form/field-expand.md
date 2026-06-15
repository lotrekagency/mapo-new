# Field Expand

A field with `expandable: true` can blow up to fill the entire group container. Useful for textareas, rich-text editors, maps — anything that benefits from more vertical space without the user having to leave the form.

## TL;DR

```ts
{ key: 'content', type: 'editor', expandable: true, group: 'Page' }
```

Click the ↔ icon in the field label → the group becomes a fullscreen overlay; the expanded field takes the entire viewport height.

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

- The `MapoFormGroup` becomes a fullscreen overlay (`position: fixed; inset: 1rem; z-index: 50`).
- A semi-transparent backdrop covers the rest of the page.
- The other fields in the group are hidden.
- The expanded field claims all available height (`flex: 1; min-height: 0`).
- Body scroll is locked.

To exit: click the backdrop, press `ESC`, or click the ↙ button in the group header.

## How to: combine with `cols`

`expandable` works on both flat-grid fields and grouped fields. The expand chrome lives in the group header, so the field must declare a `group`. A flat field (no group) does **not** show the expand button by design — the system needs a container to take over.

If you want a single field to expand, give it its own group:

```ts
{ key: 'description', type: 'textarea', group: 'Description', expandable: true }
```

## How to: prevent two fields expanding at once

Only one field can be expanded inside the same group. If you have two `expandable` editors in the same group, expanding the second collapses the first automatically.

## Pitfalls

- **No `group` ⇒ no button** — without `group: '…'`, the expand icon is hidden. This is intentional: the system expands the group container, not the bare field.
- **Hover-only icon by default** — the icon is hover-revealed to keep the UI clean. While the field is expanded, the icon stays visible to give a clear exit affordance.
- **Body-scroll lock interaction** — if you also use Focus Mode in the same form, both compete for `document.body.style.overflow`. The shared scroll-lock counter handles it correctly; do not toggle `overflow` yourself.

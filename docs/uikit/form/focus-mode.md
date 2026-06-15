# Focus Mode

Focus Mode isolates a single repeater item in a fullscreen view, removing the visual noise of the parent form while editing complex blocks. It is the editing experience users expect from a CMS — but with no extra wiring on your part.

## TL;DR

```vue
<!-- layouts/default.vue -->
<template>
  <div>
    <slot />
    <MapoFocusPortal />
    <!-- Mount once, globally -->
  </div>
</template>
```

The `i-lucide-maximize-2` icon now appears on every repeater item header. Click it → fullscreen edit. Press `ESC` or click "Close" to exit.

---

## Setup

Mount `<MapoFocusPortal />` exactly once in the app layout (or in `MapoRootComponents` if you have one). The component is global because the focus state lives in `useState('mapo:form:focusTarget')` — one focus target across the whole app, request-scoped on SSR.

```vue
<!-- layouts/default.vue -->
<template>
  <div>
    <slot />
    <MapoFocusPortal />
  </div>
</template>
```

## Built-in trigger

Every `MapoRepeaterItem` already shows the maximize icon in its header. Clicking it:

- Opens the focus portal in a `<Teleport>` over the body
- Locks body scroll
- Renders the same `MapoFormField`s the inline view does, but with the full viewport
- Syncs every change back to the parent in real time — no explicit save step

Exit with:

- The "Close" button in the portal footer
- Pressing `ESC`

## How to: open Focus Mode programmatically

`useFocusMode()` exposes the same API the repeater uses:

```ts
const focusMode = useFocusMode();

focusMode.enter({
  descriptor: repeaterDescriptor,
  fields: itemFields,
  model: itemModelRef,
  errors: itemErrorsRef,
  onUpdate: (val) => {
    /* update the item in the parent */
  },
  registry: formRegistry,
  languages: ["it", "en"],
  currentLang: "it",
  breadcrumb: ["Article", "Blocks", "Block 3"],
});

// Close it again
focusMode.exit();

// Read state
focusMode.focusTarget; // Ref<FocusTarget | null>
focusMode.isActive; // ComputedRef<boolean>
```

You typically only need this for power-user shortcuts (e.g. an "edit in fullscreen" button on a card you render outside the repeater).

## How to: customize the breadcrumb

The breadcrumb in the portal header is built from `descriptor.label` plus `previewLabel(item)`. Tune both:

```ts
{
  key: 'blocks',
  type: 'repeater',
  label: 'Content blocks',
  attrs: {
    previewLabel: (item) =>
      item.type === 'text' ? `Text: ${item.title}` : 'Image',
  },
}
```

The portal then shows "Content blocks → Text: Hello world" while the user edits the third block.

## How to: gate Focus Mode for some items

If you do not want the maximize icon on every item, check `descriptor.attrs` inside the repeater item template — but typically Focus Mode is value-add for every repeater item, so no gating is needed by default.

## Behavior details

- **Transition** — `scale(0.98) → scale(1) + opacity` on a 200 ms ease curve.
- **Body scroll** — locked while the portal is open via `document.body.style.overflow = 'hidden'`. Cleanup is reference-counted: opening Field Expand and Focus Mode together does not unlock prematurely.
- **State scope** — `useState` keeps the focus target per-request on SSR, so two concurrent users are not exposed to each other's editing context.
- **No save step** — the portal is a different _view_ of the same item; updates flow upstream as the user types, exactly like the inline view.

## Pitfalls

- **Forgetting to mount `<MapoFocusPortal />`** — clicking the maximize icon does nothing. The repeater item assumes the portal exists somewhere up the tree.
- **Two portals** — mounting the component twice produces double overlays. Keep it in the layout, not in a page.
- **Manual `focusMode.enter()` outside of a repeater** — works, but you must keep `model` reactive (a `ref`) so two-way updates land back on your parent state. Passing a plain object once will look right but throw away every edit.

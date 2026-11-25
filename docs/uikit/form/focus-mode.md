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

Inside focus mode, the items of a nested repeater have no maximize icon: focus mode shows one item at a time, and they are edited in place.

Exit with:

- The "Close" button in the portal footer
- Pressing `ESC`. It closes the top layer only: while a select menu, popover or modal opened from the item is open, or a field expanded in it, `ESC` closes that one first.

## How to: open Focus Mode programmatically

`useFocusMode()` exposes the same API the repeater uses:

```ts
const focusMode = useFocusMode();

focusMode.enter({
  descriptor: repeaterDescriptor,
  fields: itemFields,
  model: { ...item },
  errors: itemErrorsRef,
  onUpdate: (val) => {
    /* write the keys that changed to the item in the parent */
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
- **Stacking** — the portal has no `z-index`. Like Nuxt UI overlays, it stacks by its place in `<body>`: it mounts at the end of `<body>` when it opens, above the page and above an expanded field it was opened from, and the select menus, popovers and modals of its fields mount after it, above it. Do not give it a `z-index` in a theme or an override: it would cover them. An overlay mounted before the portal opened, such as a `UModal` declared in a page or a layout and opened from a custom field, sits before it in `<body>` and shows under it: mount that overlay when it opens, with `v-if` or `useOverlay()`.
- **Body scroll** — locked while the portal is open via `document.body.style.overflow = 'hidden'`. Cleanup is reference-counted: opening Field Expand and Focus Mode together does not unlock prematurely.
- **State scope** — `useState` keeps the focus target per-request on SSR, so two concurrent users are not exposed to each other's editing context.
- **No save step** — the portal is a different _view_ of the same item; updates flow upstream as the user types, exactly like the inline view.

## Pitfalls

- **Forgetting to mount `<MapoFocusPortal />`** — clicking the maximize icon does nothing. The repeater item assumes the portal exists somewhere up the tree.
- **Two portals** — mounting the component twice produces double overlays. Keep it in the layout, not in a page.
- **Manual `focusMode.enter()` outside of a repeater** — focus mode edits a shallow copy of `model` and hands it to `onUpdate` each time a field changes one of its keys: write the keys that changed to your state there, or the edits stay in the copy. `onUpdate` can still be called just after focus mode closed, by a field whose debounce was running.

# AGENTS.md — `@mapomodule/form`

Local rules for the form engine. The root [`AGENTS.md`](../../../AGENTS.md) still applies. Adding a field type has its own procedure: [`docs/contributing/add-field-type.md`](../../../docs/contributing/add-field-type.md).

## What this package is

A form is an array of `FieldDescriptor` objects. The engine resolves each descriptor's `type` through the field registry (type → lazily loaded component, default `attrs`, optional accessor) and renders it with `MapoForm`, `MapoFormField`, `MapoFormGroup` and `MapoFormTabs`. `useMapoForm()` exposes the same engine headless; `MapoDetail` in `@mapomodule/uikit` is its main consumer.

## Layout

```text
src/
  module.ts                     options (fields, groups, debounce), registry plugin, components, addImports,
                                devtools page /_mapo/devtools/forms
  index.ts                      public types and helpers (resolved as @mapomodule/form/types)
  runtime/types/descriptor.ts   KnownFieldType, FieldBase, one *Descriptor per type, FieldDescriptor, AnyFieldDescriptor
  runtime/registry/defaults.ts  the default registry: mapping, attrs, accessor
  runtime/plugins/form-registry.ts   provides $mapoFormRegistry (defaults + app config)
  runtime/components/           shell components; fields/ (Mapo*Field.vue) and fields/nui/ (Nuxt UI wrappers)
  runtime/composables/          useMapoForm, useFormFromSchema, useFormDraft, useFocusMode, useProgressiveDisclosure,
                                defineFormField, useUnsavedChangesGuard, useMediaManager, useCurrentLang
  __tests__/                    Vitest suites, with the #imports mock used by the root config
```

## Rules

1. **The field contract is fixed**: props `modelValue`, `descriptor`, `errors`, `readonly`, `disabled`; one event, `update:modelValue`. Custom fields in apps rely on it.
2. **Descriptors are public API.** A new or renamed property on `FieldBase` or a `*Descriptor` changes every app's types. Document each `attrs` member with JSDoc: the MCP server shows it to assistants through `mapo_list_field_types`.
3. **The registry stays lazy.** Every mapping entry is `() => import(...)` of a real `.vue` file: Nuxt UI components are compile-time auto-imports and cannot be resolved by name at runtime.
4. **Only serializable options reach `runtimeConfig.public.mapoForm`**: `mapping` and `accessor` hold functions, so apps extend them with `defineFormField()` or a plugin, never through `nuxt.config`.
5. **Media fields live here, the media manager does not.** `media`, `media-m2m` and `enhanced-media` resolve `MapoMediaManagerDialog` from `@mapomodule/uikit` at runtime and render a notice when it is absent. Keep that seam.
6. **Dynamic grid classes** (`col-span-*`) are safelisted in `packages/@mapomodule/uikit/src/runtime/assets/main.css`, which also scans this package's components and composables for Tailwind. A new runtime-built class goes in that safelist.
7. **Labels** use `useI18n().t("mapo.…")` with keys in both catalogs of `@mapomodule/i18n`.

## Change together

| You change                      | Also change                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| A field type                    | The procedure page above, end to end                                                          |
| A composable's signature        | `docs/uikit/form/composable.md` or the feature page, `docs/modules/api.md` if listed there    |
| A shell component's props/slots | `docs/uikit/form/api.md`, `docs/uikit/form/slots.md`                                          |
| `useFormFromSchema` mapping     | `docs/uikit/form/schema-to-form.md`; check `mcp/src/runtime/core/openapi.ts` stays consistent |
| Progressive disclosure helpers  | `docs/uikit/form/progressive-disclosure.md` and the `addImports` list in `module.ts`          |

## Verify

```bash
pnpm --filter @mapomodule/form test           # skips *.component.test.ts (no Vue plugin here)
pnpm exec vitest run packages/@mapomodule/form # from the root: the component tests too
pnpm --filter @mapomodule/form typecheck      # vue-tsc: templates are part of the gate
pnpm --filter @mapomodule/form lint
```

Then check the change in `apps/example-e2e/app/pages/form/` (one page per form scenario). After a type, descriptor or JSDoc change, rebuild `@mapomodule/mcp` and run its tests.

## Gotchas

- **A field remounts and loses focus when the parent re-renders** → `MapoFormField` creates the async component inside a `computed`, so a new descriptor object means a new component. Keep descriptor objects stable; the fix (caching per loader) is an open thread in the root manual.
- **An editor field shows its client error only on submit, never on blur** → `MapoWygEditor` gets `@blur` on its root `div`, which never has the focus (open thread). Keep it a single-root component: a second root drops the `flex-1`, `id` and `style` that `MapoFormField` passes, and the editor shrinks to its toolbar.
- **A select menu, popover or modal opened from focus mode or an expanded field does not show** → the layer got a `z-index`, or its `Teleport` mounts ahead of time. Nuxt UI overlays have no `z-index` and stack by their place in `<body>`, so `MapoFocusPortal` and the expanded-field panels have none and mount when they open (`useMountedWhileOpen`): rendered on the server, a `Teleport` sits before the app. They carry `data-mapo-layer` and close on Escape only as the top layer (`isTopLayer`), and lock the page's scroll with a counted lock on `<html>` (`usePageScrollLock`): never set `overflow` on `<html>` or `<body>` from a layer, as Nuxt UI modals save and restore the one on `<body>`. The helpers are in `runtime/utils/layers.ts`. An overlay mounted before the layer opened still shows under it.
- **An edit made in focus mode is gone once it closes** → the fields write into the model in place, and `MapoForm`'s `update:modelValue` (emitted from `useMapoForm`'s `onUpdate`) stops once the portal has closed, while a field's debounced write can land later. So `MapoFocusPortal` watches the keys of its copy of the item (`deep: 1`) and hands the copy to `onUpdate`; the nested objects are the item's own. A deeper watch would hand the stale copy back each time the item edits a nested object, after close too. The copy comes from `toRaw(focusTarget.value)`: `focusTarget` is read-only all the way down, and so would the nested objects be. `MapoRepeaterItem` applies only the keys changed since the last hand-back (a nested object both sides created after opening, such as a first translation, is still replaced whole), and hides its focus mode button inside focus mode (`mapoInFocusMode`): a nested item opened there would replace the item in the same sub-form.
- **Two quick changes to a repeater keep only the last** → the field writes the list into the model once its debounce has run out, so `MapoRepeater` shows and changes the list it emitted last (`emitted`) until `modelValue` catches up. Route every change through `emitItems`.
- **A type renders `MapoUnknownField`** → it is not in the registry the app sees: check `defineFormField()` ran in a plugin, or the spelling of `type`.
- **Types collapse to `any` in apps** → the build's `clean-empty-vue-dts.mjs` step was skipped.

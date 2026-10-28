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
                                defineFormField, useUnsavedChangesGuard, useMediaManager, useCurrentLang,
                                useFieldAnnotation
  runtime/utils/                flattenFieldGroups, repeaterTemplates, tabVisibility, fieldComponent (one async
                                component per registry loader), annotations (lookup by value path, tab badges)
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

| You change                      | Also change                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A field type                    | The procedure page above, end to end                                                                                                                       |
| A composable's signature        | `docs/uikit/form/composable.md` or the feature page, `docs/modules/api.md` if listed there                                                                 |
| A shell component's props/slots | `docs/uikit/form/api.md`, `docs/uikit/form/slots.md`                                                                                                       |
| `useFormFromSchema` mapping     | `docs/uikit/form/schema-to-form.md`; check `mcp/src/runtime/core/openapi.ts` stays consistent                                                              |
| Progressive disclosure helpers  | `docs/uikit/form/progressive-disclosure.md` and the `addImports` list in `module.ts`                                                                       |
| Field annotations               | `docs/uikit/form/annotations.md`, `docs/uikit/form/api.md`, `useFieldAnnotation` in `docs/modules/api.md`; the `annotations` prop of `MapoDetail` in uikit |

## Verify

```bash
pnpm --filter @mapomodule/form test
pnpm exec vitest run packages/@mapomodule/form   # from the root: also the *.component.test.ts files
pnpm --filter @mapomodule/form typecheck      # vue-tsc: templates are part of the gate
pnpm --filter @mapomodule/form lint
```

Then check the change in `apps/example-e2e/app/pages/form/` (one page per form scenario). After a type, descriptor or JSDoc change, rebuild `@mapomodule/mcp` and run its tests.

## Gotchas

- **A field with `is` remounts and loses focus when `fields` is recomputed** → the component or the loader in `is` is written inside the computed, so each recompute brings a new one. Declare it once at module level. Registry entries are wrapped once per loader (`runtime/utils/fieldComponent.ts`), so new descriptor objects of the same type keep the field mounted.
- **An editor field shows its client error only on submit, never on blur** → `MapoWygEditor` gets `@blur` on its root `div`, which never has the focus (open thread). Keep it a single-root component: a second root drops the `flex-1`, `id` and `style` that `MapoFormField` passes, and the editor shrinks to its toolbar.
- **A type renders `MapoUnknownField`** → it is not in the registry the app sees: check `defineFormField()` ran in a plugin, or the spelling of `type`.
- **Types collapse to `any` in apps** → the build's `clean-empty-vue-dts.mjs` step was skipped.

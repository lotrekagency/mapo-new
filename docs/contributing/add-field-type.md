# Adding a built-in field type

How to add a field type to `@mapomodule/form` itself, so every Mapo app gets it. Read it before touching the field registry or the descriptor types.

## Built-in or custom?

Most new fields belong in the app that needs them, registered with `defineFormField()` ([Custom fields](/uikit/form/custom-fields)). Add a built-in type only when it is broadly useful, has no app-specific behaviour, and none of the existing types covers it with `attrs`, slots or an accessor.

Check the existing types first: the registry in `packages/@mapomodule/form/src/runtime/registry/defaults.ts`, or `mapo_list_field_types` on the MCP server.

## The field contract

A field component receives exactly these props and emits one event:

```vue
<script setup lang="ts">
import type { CustomDescriptor } from "../../types/index.js";

defineProps<{
  modelValue: unknown;
  descriptor: CustomDescriptor; // the typed descriptor of your new type
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: unknown] }>();
</script>
```

`MapoFormField` resolves the component from the registry, merges the registry's default `attrs` with the descriptor's `attrs`, and passes the result down. The component never fetches the record or writes to it directly: it emits the new value.

## Steps

### 1. The component

Create it in `packages/@mapomodule/form/src/runtime/components/fields/`:

- `Mapo<Name>Field.vue` for a component with its own logic;
- `nui/Nui<Name>.vue` for a thin wrapper around a Nuxt UI component. Nuxt UI components are auto-imported at compile time, so the registry needs a real `.vue` file to load lazily.

Use Nuxt UI components and semantic tokens for styling, and take every user-facing label from the i18n catalogs (step 4 of [Adding a UIKit component](./add-component) shows how). Components that touch `window` or `document` must render client-side only.

### 2. The type name

Add the type to the `KnownFieldType` enum in `packages/@mapomodule/form/src/runtime/types/descriptor.ts`.

### 3. The descriptor

In the same file, add a `<Name>Descriptor` interface that extends `FieldBase<T>`, narrows `type` to the new enum value and declares its `attrs` with a JSDoc comment on each attribute. Add it to the `FieldDescriptor` union.

The JSDoc is not optional: the MCP server extracts these interfaces at build time, and the comments become the attribute descriptions that `mapo_list_field_types` gives AI assistants.

If the type reuses an existing descriptor shape (as `email` reuses `TextDescriptor`), add the enum value to that interface's `type` union instead.

### 4. The registry

Register the component in `packages/@mapomodule/form/src/runtime/registry/defaults.ts`:

- `mapping`: `"<type>": () => import("../components/fields/Mapo<Name>Field.vue")`;
- `attrs`: default attributes for the type, if any;
- `accessor`: only if the value stored on the record differs from what the component edits.

Register the component with `addComponent()` in `packages/@mapomodule/form/src/module.ts` only if apps must also use it directly, as the media fields are.

### 5. Labels

Add the labels to both catalogs, `packages/@mapomodule/i18n/src/runtime/locales/mapo.en.json` and `mapo.it.json`, under the `mapo.` namespace.

### 6. The MCP server

- The field list, the component and the `attrs` are extracted automatically when `@mapomodule/mcp` builds. Check that `mapo_list_field_types` shows the new type after `pnpm --filter @mapomodule/mcp build`.
- If an OpenAPI or DRF schema shape should map to the new type, extend `packages/@mapomodule/mcp/src/runtime/core/openapi.ts` and its tests.
- If the type needs required `attrs` in scaffolded code, check `packages/@mapomodule/mcp/src/runtime/core/scaffold/fields.ts`.

### 7. Tests

- Registry resolution and default attrs: `packages/@mapomodule/form/src/__tests__/registry.test.ts`.
- Any value transformation (accessor, parsing, formatting) gets its own unit test.

### 8. Docs and the reference app

- Add the type to `docs/uikit/form/add-fields.md` and its component to `docs/uikit/form/api.md`.
- Update `docs/guide/feature-status.md` and the list of built-in types in `docs/guide/concepts.md`.
- Add the field to a form page in `apps/example-e2e/app/pages/form/` and check it renders, saves and shows errors. → [Live verification](./testing#live-verification-in-the-reference-app)

## Checklist

- [ ] Component, enum value, descriptor with documented `attrs`, registry entry.
- [ ] Labels in both catalogs.
- [ ] Tests for registry resolution and value logic.
- [ ] `mapo_list_field_types` lists the type after an MCP build.
- [ ] Docs and feature status updated; the field works in `apps/example-e2e`.

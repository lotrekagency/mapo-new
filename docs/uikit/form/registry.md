# Field registry

The registry is the object that maps a `type` string to its Vue component. It is the extension point for adding or overriding any field type.

## Shape

```ts
interface FieldRegistry {
  // type → component (NUI string, lazy import, or imported Component)
  mapping: Record<
    string,
    string | (() => Promise<{ default: Component }>) | Component
  >;

  // default attrs per type — merged with descriptor.attrs (descriptor wins)
  attrs: Record<string, Record<string, unknown>>;

  // get/set accessor per type — to transform the value in the model
  accessor: Record<
    string,
    {
      get?: (ctx: { model: unknown; val: unknown; lang?: string }) => unknown;
      set?: (ctx: { model: unknown; val: unknown; lang?: string }) => unknown;
    }
  >;
}
```

## Global registry (`$mapoFormRegistry`)

The `@mapomodule/form` plugin injects `$mapoFormRegistry` into `useNuxtApp()`. It contains every built-in type.

`<MapoForm>` and `<MapoDetail>` resolve this registry automatically — you do not need to pass `:registry` unless you want to swap it. The headless `useMapoForm()` composable keeps `registry` mandatory because it can be used outside Nuxt context (tests, SSR previews).

```ts
// Component path — no boilerplate
<MapoForm v-model="model" :fields="fields" />

// Headless path — explicit registry
const { $mapoFormRegistry } = useNuxtApp()
const form = useMapoForm({ model, fields, registry: $mapoFormRegistry })
```

## Add types globally — `defineFormField()` (recommended)

```ts
// app/plugins/my-fields.ts
export default defineNuxtPlugin(() => {
  defineFormField(
    "star-rating",
    () => import("~/components/StarRatingField.vue"),
    {
      attrs: { maxStars: 5, color: "amber" },
    },
  );

  // Override a built-in type — explicit opt-in to silence the warning
  defineFormField("editor", () => import("~/components/MyEditor.vue"), {
    override: true,
  });
});
```

`defineFormField()` reads `$mapoFormRegistry` from the active Nuxt app and mutates it. Re-registering an existing type prints a development warning unless `{ override: true }` is set.

## Add types globally — `nuxt.config.ts` (legacy / static)

The `nuxt.config.ts` shape still works, but only `attrs` are JSON-serializable across the runtime config boundary; `mapping` and `accessor` contain functions and must be set inside a plugin (i.e. via `defineFormField`).

```ts
// nuxt.config.ts — only attrs here
export default defineNuxtConfig({
  mapoForm: {
    fields: {
      attrs: {
        "star-rating": { maxStars: 5 },
      },
    },
  },
});
```

## Real-world example: swap the entire UI library

The registry is the seam where you can replace **all** the default Nuxt UI wrappers with components from a different library (Vuetify, PrimeVue, your own design system). Plugins inside `app/plugins/` always run after module plugins, so `$mapoFormRegistry` is already populated when this code runs.

```ts
// app/plugins/mapo-vuetify-registry.ts
export default defineNuxtPlugin(({ $mapoFormRegistry }) => {
  const reg = $mapoFormRegistry as {
    mapping: Record<string, () => Promise<unknown>>;
    attrs: Record<string, Record<string, unknown>>;
  };

  // Replace the entire mapping with Vuetify-based wrappers. Any descriptor
  // `type` not listed here will fall back to MapoUnknownField.
  reg.mapping = {
    text: () => import("~/components/fields/MapoVTextField.vue"),
    textarea: () => import("~/components/fields/MapoVTextareaField.vue"),
    number: () => import("~/components/fields/MapoVNumberField.vue"),
    select: () => import("~/components/fields/MapoVSelectField.vue"),
    boolean: () => import("~/components/fields/MapoVSwitchField.vue"),
    switch: () => import("~/components/fields/MapoVSwitchField.vue"),
    date: () => import("~/components/fields/MapoVDateField.vue"),
    datetime: () => import("~/components/fields/MapoVDateField.vue"),
  };

  // Drop NUI-specific defaults (e.g. `class: 'w-full'`) that don't apply
  // to the new library — start from a clean slate.
  reg.attrs = { All: {} };
});
```

Each `MapoV*Field.vue` follows the same contract as any custom field: `defineProps<{ modelValue, descriptor, errors?, readonly? }>()` + `defineEmits<{ 'update:modelValue': [unknown] }>()`. See [Custom fields →](./custom-fields).

## Per-page registry override

To swap the registry for a single page:

```ts
const { $mapoFormRegistry } = useNuxtApp();
import StarRatingField from "~/components/StarRatingField.vue";

const localRegistry = {
  ...$mapoFormRegistry,
  mapping: {
    ...$mapoFormRegistry.mapping,
    "star-rating": StarRatingField,
  },
  attrs: {
    ...$mapoFormRegistry.attrs,
    "star-rating": { maxStars: 10 },
  },
};
```

```vue
<MapoForm :registry="localRegistry" ... />
```

## `descriptor.is` — per-field bypass

For a single field, you can pass the component directly:

```ts
import StarRatingField from "~/components/StarRatingField.vue";

const fields = [{ key: "rating", type: "star-rating", is: StarRatingField }];
```

`descriptor.is` has absolute priority over the registry for that field.

## Accessor

Accessors transform the value before it reaches the component (`get`) and after the component emits an update (`set`):

```ts
defineFormField("price-cents", () => import("~/components/PriceField.vue"), {
  accessor: {
    // Convert cents ↔ euros for display
    get: ({ val }) => (val != null ? Number(val) / 100 : null),
    set: ({ val }) => (val != null ? Math.round(Number(val) * 100) : null),
  },
});
```

The registry accessor can be overridden per descriptor via `descriptor.accessor`:

```ts
{
  key: 'price',
  type: 'number',
  accessor: {
    get: ({ val }) => (val as number) / 100,
    set: ({ val }) => (val as number) * 100,
  },
}
```

## Unknown type

If a `type` is not in the registry and the descriptor has no `is`, `MapoUnknownField` is rendered — a yellow placeholder that surfaces the missing type. The form does not break.

## Built-in defaults

> Wrapper components live in `@mapomodule/form/runtime/components/fields`. Every NUI mapping is a thin `.vue` wrapper (`NuiInput`, `NuiTextarea`, `NuiCheckbox`, `NuiSwitch`, `NuiSlider`, `NuiSelectMenu`) — required because Nuxt UI uses Vite auto-import (compile-time), so `resolveComponent()` cannot find `<UInput>` etc. at runtime. All mappings are lazy imports for tree-shaking.

A `class: 'w-full'` default is applied to **every** field via `attrs.All`.

| Type                                   | mapping                           | attrs (per-type)                                          | accessor                               |
| -------------------------------------- | --------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| `text`                                 | `NuiInput` (`<UInput>`)           | —                                                         | —                                      |
| `textarea`                             | `NuiTextarea` (`<UTextarea>`)     | —                                                         | —                                      |
| `number`                               | `NuiInput`                        | `{ type: 'number' }`                                      | —                                      |
| `boolean`                              | `NuiCheckbox` (`<UCheckbox>`)     | —                                                         | —                                      |
| `switch`                               | `NuiSwitch` (`<USwitch>`)         | —                                                         | —                                      |
| `slider`                               | `NuiSlider` (`<USlider>`)         | —                                                         | —                                      |
| `color`                                | `NuiInput`                        | `{ type: 'color' }`                                       | —                                      |
| `file`                                 | `NuiInput`                        | `{ type: 'file' }`                                        | —                                      |
| `select`                               | `NuiSelectMenu` (`<USelectMenu>`) | `{ valueKey: 'value' }`                                   | —                                      |
| `date`                                 | `MapoDateField`                   | —                                                         | —                                      |
| `time`                                 | `MapoTimeField`                   | —                                                         | —                                      |
| `datetime`                             | `MapoDateTimeField`               | —                                                         | —                                      |
| `fks`                                  | `MapoFksField`                    | `{ itemValue: 'id', returnObject: true }`                 | —                                      |
| `m2m`                                  | `MapoFksField`                    | `{ itemValue: 'id', returnObject: true, multiple: true }` | —                                      |
| `editor`                               | `MapoWygEditor`                   | —                                                         | —                                      |
| `seo`                                  | `MapoSeoPreview`                  | —                                                         | normalises `url` ↔ `permalink` aliases |
| `map`                                  | `MapoMapField` (SSR-safe)         | —                                                         | —                                      |
| `repeater`                             | `MapoRepeater`                    | —                                                         | —                                      |
| `media`, `media-m2m`, `enhanced-media` | _(unregistered)_                  | _Phase 6 — Media Manager_                                 | —                                      |

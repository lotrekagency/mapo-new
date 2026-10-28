# Field annotations

Annotations mark fields from outside their descriptors. A marked field shows an icon next to its label, and the icon opens a popover with a text and some actions. Each tab, and each repeater item, shows how many marks it holds.

The marks live in a reactive map that you pass to `<MapoForm>` or `<MapoDetail>`. Changing the map updates the marks and never remounts a field, so the field being typed in keeps the focus while marks come and go.

Use them for anything that describes a value without being part of it: values suggested by an assistant, values imported from another system, changes since the last version, a reviewer's notes.

## TL;DR

```vue
<script setup lang="ts">
import type { FieldAnnotations } from "mapomodule/types";

const annotations = ref<FieldAnnotations>({
  title: {
    label: "Imported from the old site",
    icon: "i-lucide-download",
    color: "info",
    description: "Check the capitalisation before publishing.",
    actions: [
      {
        label: "Looks good",
        icon: "i-lucide-check",
        onClick: () => dismiss("title"),
      },
    ],
  },
});

function dismiss(path: string) {
  const { [path]: _, ...rest } = annotations.value;
  annotations.value = rest;
}
</script>

<template>
  <MapoForm v-model="article" :fields="fields" :annotations="annotations" />
</template>
```

## How a field is addressed

A key of the map is the path of a value in the model, the same path the server errors use:

| Field                                              | Path                                                       |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `title`                                            | `title`                                                    |
| `seo.title` (a dotted key)                         | `seo.title`                                                |
| `title` with `translatable: true`, language `it`   | `translations.it.title`, or `title` to mark every language |
| `title` in the first item of the repeater `blocks` | `blocks.0.title`                                           |

For a translatable field the mark of the current language wins; without one, the field shows the mark at its bare key. A mark at `translations.en.title` shows only while English is the current language.

## The annotation

```ts
interface FieldAnnotation {
  label: string; // accessible name of the mark, title of the popover
  icon?: string; // default "i-lucide-info"
  color?: FieldAnnotationColor; // default "neutral"
  dot?: boolean; // a dot on the mark, to ask for attention
  description?: string; // text of the popover
  actions?: readonly FieldAnnotationAction[];
}

interface FieldAnnotationAction {
  label: string;
  icon?: string;
  color?: FieldAnnotationColor; // default "neutral"
  onClick: () => void;
}
```

`color` is a Nuxt UI color: `primary`, `secondary`, `success`, `info`, `warning`, `error`, `neutral`, or one the app adds. To give your marks a color of their own, register it in `nuxt.config.ts` (`ui.theme.colors`, keeping the default ones) and assign it in `app.config.ts` (`ui.colors`), as the [Nuxt UI design system](https://ui.nuxt.com/docs/getting-started/theme/design-system#extend-colors) explains.

An action runs only its own `onClick`: to remove the mark, remove its entry from the map.

## Badges on tabs and repeater items

Each tab shows one badge per icon and color of the marks it holds, with their count: three values from one source and one to check make two badges. A tab counts the marks its fields display:

- the fields of its groups, of their sub-tabs and of its child tabs;
- only the fields the model shows (`visible` and `show`), and a translatable field in the current language only;
- inside a repeater, item by item: the marks under `<key>.<index>` for the fields that item renders (its template's, if any), shown for the item's own values.

Repeater items start collapsed, so the header of each item, and its mini-card, shows the same badges for the marks it holds: they tell which item to open.

The badge's accessible name comes from `mapo.form.annotationCount` ("2 marked fields: Suggested by AI").

## Custom popover content

The slot `field.<key>.annotation` replaces the description, between the title and the actions. It receives `{ annotation, descriptor }`. Here it quotes the passage a value comes from, kept by the app in `excerpts`:

```vue
<MapoForm v-model="page" :fields="fields" :annotations="annotations">
  <template #field.summary.annotation>
    <blockquote class="border-l-2 border-default pl-2 text-muted">
      {{ excerpts.summary }}
    </blockquote>
  </template>
</MapoForm>
```

## Custom labels

The slot `field.<key>.label` replaces the whole label, mark included. It receives `annotation`, so a custom label can show the same mark with `<MapoFormAnnotation>`:

```vue
<template #field.slug.label="{ label, annotation }">
  <span class="flex items-center gap-1 text-sm font-medium">
    <UIcon name="i-lucide-link" />
    {{ label }}
    <MapoFormAnnotation v-if="annotation" :annotation="annotation" />
  </span>
</template>
```

## Read the annotation in a custom field

A custom field, registered with `defineFormField()` or passed in `descriptor.is`, gets the mark, the popover and the counts without any code: they live in `MapoFormField`, around the component. To use the annotation inside the field as well, to highlight it, show the text next to the control or offer the actions there, call `useFieldAnnotation()`. It is auto-imported, like the other form composables.

```ts
const props = defineProps<{
  modelValue: string | null;
  descriptor: TextDescriptor;
}>();
const annotation = useFieldAnnotation(() => props.descriptor);
// annotation.value is a FieldAnnotation, or undefined when the field has none
```

It returns the annotation the mark shows, found with the same rule: the path of the value, the current language first, then the bare key. It changes with the map, and the field stays mounted. Pass the descriptor as a getter, `() => props.descriptor`, so the composable follows a descriptor that the form rebuilds.

### A complete field

A text field that lights up when annotated, takes the annotation's color, and shows its description and actions under the control:

```vue
<!-- components/admin/ReviewedTextField.vue -->
<script setup lang="ts">
import type { InputProps } from "@nuxt/ui";
import type { TextDescriptor } from "mapomodule/types";

const props = defineProps<{
  modelValue: string | null;
  descriptor: TextDescriptor;
  readonly?: boolean;
  /** `"error"` while the field has an error: MapoFormField sets it. */
  color?: InputProps["color"];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const annotation = useFieldAnnotation(() => props.descriptor);

// An error wins over the annotation's color.
const color = computed(
  () =>
    props.color ??
    (annotation.value?.color as InputProps["color"]) ??
    "primary",
);
</script>

<template>
  <div class="space-y-1">
    <UInput
      :model-value="modelValue ?? undefined"
      :readonly="readonly"
      :color="color"
      :highlight="Boolean(annotation)"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-if="annotation" class="flex flex-wrap items-center gap-2 text-xs">
      <span class="text-muted">{{ annotation.description }}</span>
      <UButton
        v-for="(action, index) in annotation.actions ?? []"
        :key="index"
        :label="action.label"
        :icon="action.icon"
        size="xs"
        variant="link"
        @click="action.onClick()"
      />
    </div>
  </div>
</template>
```

Register it from a plugin, for a type of its own or, with `{ override: true }`, in place of `text` for every text field; [Custom fields](./custom-fields#registration) has the details:

```ts
// app/plugins/my-fields.ts
export default defineNuxtPlugin(() => {
  defineFormField(
    "reviewed-text",
    () => import("~/components/admin/ReviewedTextField.vue"),
  );
});
```

Colors go through the `color` prop of Nuxt UI components, which generate the classes of every theme color: a class written at runtime, such as `` `ring-${annotation.color}` ``, would not exist in the CSS.

### Where it works

- **In a form**, `MapoForm`, `MapoDetail` or a headless `useMapoForm()`: the annotation of the field.
- **In a repeater item**: the item's annotations, already keyed as the item sees them. The same component works at the top level and inside items without knowing where it is.
- **In focus mode**: the annotations of the item being edited.
- **Outside a form**, when the component is used on its own: always `undefined`, so write the template for that case too (`v-if="annotation"`, `annotation?.…`).

### Don't

- **Don't change the annotation object.** It belongs to whoever owns the map: to remove or change a mark, replace its entry in the map, which an action's `onClick` can do.
- **Don't expect an `annotation` prop.** The field contract stays `modelValue`, `descriptor`, `errors`, `readonly` and `disabled`; the composable is how a field reads its mark.
- **Don't look the annotation up yourself** through `injectMapoForm()`: the composable already applies the current language, the bare key and the item's prefix.

### Which tool for which job

| You want to                                                 | Use                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| Change the popover text of one field                        | The slot `field.<key>.annotation`                        |
| Replace the label of one field and keep the mark            | The slot `field.<key>.label` with `<MapoFormAnnotation>` |
| Make every field of a type react to its annotation          | `useFieldAnnotation()` in the field component            |
| Show a summary of all the marks, such as a banner or a list | The map you pass to the form: it is yours                |

## In a detail page

`<MapoDetail>` takes the same `annotations` prop and passes it to the body and the sidebar forms:

```vue
<MapoDetail
  endpoint="/api/pages/"
  :id="route.params.id"
  :fields="fields"
  :sidebar-fields="sidebarFields"
  :annotations="annotations"
/>
```

## Headless forms

`useMapoForm()` takes the map as `annotations`, a ref or a plain object, and puts it in the form context, where `<MapoFormField>` reads it:

```ts
const form = useMapoForm({ model, fields, registry, annotations });
```

## Repeater items and focus mode

A repeater item receives the marks under its own path, keyed as its fields see them: `blocks.0.title` reaches the first item as `title`. The repeater builds that path from its key, also when it is translatable. An item opened in focus mode keeps its marks.

## Keep in mind

- **The mark is a button named by `label`.** Color is never the only signal: write a label that says what the mark means.
- **Marks are not saved.** They live in the map you pass; the form never writes them into the model or sends them to the backend.
- **A field replaced through the `field.<key>` slot shows no mark**, because the slot replaces its label too. Its tab still counts it.
- **Marks follow the index, not the item.** Moving or removing items moves the `blocks.N.*` marks onto other items: update the map when the items change.
- **Field slots stay in their form.** `field.<key>.*` slots, the popover body included, reach the fields of the form they are passed to, not the fields inside repeater items or focus mode, where a mark shows its description.
- **Actions stay active in a read-only form.** The form cannot tell what an action does: when it changes the model, check the read-only state in `onClick`.

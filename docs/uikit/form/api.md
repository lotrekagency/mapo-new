# Form Engine — Component API Reference

Complete props, emits, slots, and exposed methods for all Form Engine components and field types.

---

## MapoForm

The main form renderer. Takes a descriptor array and a model, then renders the appropriate field components.

Descriptor typing guidance:

- Use `FieldDescriptor<T>[]` when the form uses only built-in field types. This keeps strict compile-time checks on `attrs` and catches typos early.
- Use `AnyFieldDescriptor<T>[]` only when the form includes custom field types.
- `AnyFieldDescriptor` does **not** prove that a field type is present in the registry. Registry resolution is runtime behavior; unresolved types render `MapoUnknownField` instead of crashing.

### Props

| Prop          | Type                       | Default        | Description                                                                  |
| ------------- | -------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `modelValue`  | `T`                        | — **required** | The form data object (v-model).                                              |
| `fields`      | `AnyFieldDescriptor<T>[]`  | — **required** | Array of field descriptors defining the form layout.                         |
| `errors`      | `Record<string, string[]>` | `{}`           | Server-side validation errors keyed by field path.                           |
| `languages`   | `string[]`                 | `[]`           | Available language codes for translated fields.                              |
| `currentLang` | `string`                   | `''`           | Active language code. Controlled externally (by `MapoDetail`).               |
| `readonly`    | `boolean`                  | `false`        | Make all fields read-only.                                                   |
| `immediate`   | `boolean`                  | `false`        | Run client validators immediately without waiting for the first submit.      |
| `registry`    | `FieldRegistry`            | —              | Field component registry. Auto-injected from `$mapoFormRegistry` if omitted. |

### Emits

| Event               | Payload | Description                         |
| ------------------- | ------- | ----------------------------------- |
| `update:modelValue` | `T`     | Emitted whenever any field changes. |

### Slots

| Slot          | Description                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `field.{key}` | Override the rendering of a specific field. Receives `{ field: FieldDescriptor, model: T \| undefined, currentLang: string }`. |

### Exposed Methods

| Method           | Signature                                                                        | Description                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `submit`         | `(handler: (payload, isNew) => Promise<void>, isNew?: boolean) => Promise<void>` | Run all validators; on success call `handler` with the full model (`isNew=true`) or the diff patch (`isNew=false`). |
| `validateClient` | `() => { valid: boolean; errors: Record<string, string> }`                       | Run all synchronous client validators. Returns `valid` and a map of field errors.                                   |
| `resetDirty`     | `() => void`                                                                     | Reset the dirty-tracking baseline (call after a successful save).                                                   |
| `getPatch`       | `() => Partial<T>`                                                               | Return only the fields changed since the last `resetDirty`.                                                         |
| `isDirty`        | `Ref<boolean>`                                                                   | Reactive flag — `true` when any field has changed since the last baseline.                                          |
| `isLoading`      | `Ref<boolean>`                                                                   | Reactive flag — `true` while the `submit` handler is executing.                                                     |

---

## MapoFormField

Low-level wrapper that resolves a `FieldDescriptor` to its registered component, handles label, hints, errors, and slot injection.

### Props

| Prop         | Type                 | Default        | Description                     |
| ------------ | -------------------- | -------------- | ------------------------------- |
| `descriptor` | `AnyFieldDescriptor` | — **required** | The field configuration object. |

### Slots

| Slot                  | Description                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `field.{key}.label`   | Override the field label. Receives `{ descriptor, label, model, currentLang }`.            |
| `field.{key}.before`  | Content rendered before the field wrapper. Receives `{ descriptor, model, currentLang }`.  |
| `field.{key}.prepend` | Content prepended inside the field control. Receives `{ descriptor, model, currentLang }`. |
| `field.{key}.append`  | Content appended inside the field control. Receives `{ descriptor, model, currentLang }`.  |
| `field.{key}.hint`    | Override the hint text. Receives `{ descriptor, model, currentLang }`.                     |
| `field.{key}.after`   | Content rendered after the field wrapper. Receives `{ descriptor, model, currentLang }`.   |

---

## MapoFormGroup

Collapsible section that groups related fields under a heading.

### Props

| Prop              | Type                | Default        | Description                        |
| ----------------- | ------------------- | -------------- | ---------------------------------- |
| `name`            | `string`            | — **required** | Group identifier.                  |
| `label`           | `string`            | —              | Group heading label.               |
| `fields`          | `FieldDescriptor[]` | — **required** | Fields belonging to this group.    |
| `initialExpanded` | `boolean`           | —              | Whether the group starts expanded. |

---

## MapoFormFlatSection

Flat grid layout for fields that belong to no group. Renders fields in a 12-column responsive grid and provides the same field-expand overlay as `MapoFormGroup` — without a collapsible heading.

Used internally by `MapoForm` for fields that have no `group` or `tab` set.

### Props

| Prop     | Type                | Default        | Description                   |
| -------- | ------------------- | -------------- | ----------------------------- |
| `fields` | `FieldDescriptor[]` | — **required** | Fields to render in the grid. |

### Slots

Forwards all `field.*` slot names to each `MapoFormField` child (same forwarding contract as `MapoFormGroup`).

---

## MapoFormTabs

Tab-based layout for organizing fields into named sections.

### Props

| Prop   | Type         | Default        | Description                                          |
| ------ | ------------ | -------------- | ---------------------------------------------------- |
| `tabs` | `TabEntry[]` | — **required** | Tab definitions. Each entry has `{ label, fields }`. |

---

## MapoFocusPortal

Full-screen overlay for editing a Repeater item in focus mode. Mount once inside your default layout.

### Props / Emits / Slots

None — controlled internally by `MapoRepeater` via a shared provide/inject.

---

## MapoUnknownField

Fallback field rendered when no matching component is found in the registry.

### Props

| Prop         | Type              | Default        | Description                |
| ------------ | ----------------- | -------------- | -------------------------- |
| `modelValue` | `unknown`         | — **required** | Current value.             |
| `descriptor` | `FieldDescriptor` | — **required** | Field descriptor.          |
| `errors`     | `string[]`        | —              | Validation error messages. |
| `readonly`   | `boolean`         | —              | Read-only mode.            |
| `disabled`   | `boolean`         | —              | Disabled mode.             |

### Emits

| Event               | Payload   | Description              |
| ------------------- | --------- | ------------------------ |
| `update:modelValue` | `unknown` | Emitted on value change. |

---

## Field Components

All field components share the same base interface:

```ts
Props: { modelValue, descriptor, errors?, readonly?, disabled? }
Emits: { 'update:modelValue': value }
```

### MapoDateField

Date-only picker. Serializes as `YYYY-MM-DD`.

| Prop         | Type             | Description                |
| ------------ | ---------------- | -------------------------- |
| `modelValue` | `unknown`        | ISO date string or `null`. |
| `descriptor` | `DateDescriptor` | Field configuration.       |

### MapoTimeField

Time-only picker. Emits `HH:MM` format.

| Prop         | Type             | Description            |
| ------------ | ---------------- | ---------------------- |
| `modelValue` | `unknown`        | Time string or `null`. |
| `descriptor` | `DateDescriptor` | Field configuration.   |

### MapoDateTimeField

Combined date + time picker with optional timezone handling (`naive` / `UTC`).

| Prop         | Type             | Description                                             |
| ------------ | ---------------- | ------------------------------------------------------- |
| `modelValue` | `unknown`        | ISO datetime string or `null`.                          |
| `descriptor` | `DateDescriptor` | Field configuration. `attrs.tz` controls timezone mode. |

#### `descriptor.attrs`

| Key  | Type               | Default   | Description             |
| ---- | ------------------ | --------- | ----------------------- |
| `tz` | `'naive' \| 'UTC'` | `'naive'` | Timezone handling mode. |

---

### MapoSeoPreview

SEO metadata editor with live SERP preview.

| Prop         | Type            | Description                            |
| ------------ | --------------- | -------------------------------------- |
| `modelValue` | `unknown`       | `{ title?, description?, permalink? }` |
| `descriptor` | `SeoDescriptor` | Field configuration.                   |

---

### MapoFileField

File upload field with current-file preview, remove button, and optional image thumbnail. Replaces the plain `<input type="file">` used for the `'file'` registry type.

| Prop         | Type             | Description                               |
| ------------ | ---------------- | ----------------------------------------- |
| `modelValue` | `unknown`        | A `File` object, a URL string, or `null`. |
| `descriptor` | `FileDescriptor` | Field configuration.                      |

#### `descriptor.attrs`

| Key       | Type     | Default | Description                                                           |
| --------- | -------- | ------- | --------------------------------------------------------------------- |
| `accept`  | `string` | —       | MIME type filter forwarded to the `<input>` (e.g. `'image/*'`).       |
| `maxSize` | `number` | —       | Maximum file size in bytes (UI hint only — not enforced client-side). |

When `modelValue` is a URL string ending in an image extension (`.jpg`, `.png`, `.webp`, etc.) a thumbnail is shown alongside the filename.

---

### MapoWygEditor

WYSIWYG rich-text editor powered by TipTap. Output is sanitized HTML.

| Prop         | Type               | Description          |
| ------------ | ------------------ | -------------------- |
| `modelValue` | `unknown`          | HTML string.         |
| `descriptor` | `EditorDescriptor` | Field configuration. |

The toolbar includes a disabled **Insert Image** button (placeholder for Phase 6 — Media Manager). It becomes active once `MapoMediaManagerDialog` is available.

---

### MapoMapField

Geographic coordinate picker with a Leaflet map and manual lat/lng inputs.

| Prop         | Type            | Description                            |
| ------------ | --------------- | -------------------------------------- |
| `modelValue` | `unknown`       | `{ lat: number, lng: number } \| null` |
| `descriptor` | `MapDescriptor` | Field configuration.                   |

#### `descriptor.attrs`

| Key          | Type     | Default | Description                                 |
| ------------ | -------- | ------- | ------------------------------------------- |
| `defaultLat` | `number` | `41.9`  | Initial map latitude when no value is set.  |
| `defaultLng` | `number` | `12.5`  | Initial map longitude when no value is set. |
| `zoom`       | `number` | `6`     | Initial map zoom level.                     |

---

### MapoFksField

Foreign key selector with remote search. Supports single and multi-select.

| Prop         | Type            | Description                                     |
| ------------ | --------------- | ----------------------------------------------- |
| `modelValue` | `unknown`       | Selected item object, array of items, or ID(s). |
| `descriptor` | `FksDescriptor` | Field configuration.                            |

#### `descriptor.attrs`

| Key            | Type      | Default        | Description                                                                                                     |
| -------------- | --------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `endpoint`     | `string`  | — **required** | API endpoint for option search. Relative paths (no leading `/`) are automatically normalized by prepending `/`. |
| `itemText`     | `string`  | `'name'`       | Model field to display as label.                                                                                |
| `itemValue`    | `string`  | `'id'`         | Model field to use as value.                                                                                    |
| `multiple`     | `boolean` | `false`        | Allow multi-selection.                                                                                          |
| `returnObject` | `boolean` | `true`         | Emit the full object instead of only the ID.                                                                    |

---

### MapoRepeater

Dynamic list field with drag-and-drop reordering, bulk selection, duplication, and focus mode.

| Prop         | Type                 | Description            |
| ------------ | -------------------- | ---------------------- |
| `modelValue` | `unknown`            | Array of item objects. |
| `descriptor` | `RepeaterDescriptor` | Field configuration.   |

#### `descriptor.attrs`

| Key                 | Type                                                         | Default | Description                                                                  |
| ------------------- | ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------- |
| `templates`         | `Record<string, FieldDescriptor[]>`                          | —       | Named field templates (one per item type).                                   |
| `previewLabel`      | `(item, index) => string`                                    | —       | Callback to generate an item's collapsed preview label.                      |
| `defaultExpanded`   | `boolean`                                                    | `false` | Start all items expanded.                                                    |
| `allowDuplicate`    | `boolean`                                                    | `true`  | Show the Duplicate action on each item.                                      |
| `showPositionField` | `boolean`                                                    | `false` | Show a numeric position input in each item's header for explicit reordering. |
| `minItems`          | `number`                                                     | —       | Minimum number of items (validated on submit).                               |
| `maxItems`          | `number`                                                     | —       | Maximum number of items (Add button hidden when reached).                    |
| `confirmDelete`     | `boolean`                                                    | `true`  | Show a confirmation dialog before deleting an item.                          |
| `miniCard`          | `(item, idx) => { title, subtitle, thumbnail, statusColor }` | —       | Config for the compressed mini-card view.                                    |
| `compressThreshold` | `number`                                                     | `3`     | Number of items above which the list switches to mini-card view.             |

---

## MapoRepeaterItem

Single item inside a `MapoRepeater`. Handles both full-form and mini-card views.

### Props

| Prop                 | Type                       | Default        | Description                                        |
| -------------------- | -------------------------- | -------------- | -------------------------------------------------- |
| `item`               | `Record<string, unknown>`  | — **required** | Item data.                                         |
| `fields`             | `FieldDescriptor[]`        | — **required** | Item form fields.                                  |
| `index`              | `number`                   | — **required** | Item index in the parent array.                    |
| `errorPrefix`        | `string`                   | — **required** | Error key prefix (e.g. `'items.0'`).               |
| `parentErrors`       | `Record<string, string[]>` | — **required** | Errors from the parent form.                       |
| `languages`          | `string[]`                 | — **required** | Language codes.                                    |
| `currentLang`        | `string`                   | — **required** | Active language.                                   |
| `readonly`           | `boolean`                  | — **required** | Read-only mode.                                    |
| `registry`           | `FieldRegistry`            | — **required** | Field registry.                                    |
| `previewLabel`       | `(item, index) => string`  | —              | Callback to generate the collapsed preview label.  |
| `defaultExpanded`    | `boolean`                  | — **required** | Initial expanded state.                            |
| `allowDuplicate`     | `boolean`                  | —              | Show Duplicate action.                             |
| `repeaterDescriptor` | `RepeaterDescriptor`       | —              | Parent repeater descriptor (for mini-card config). |
| `totalItems`         | `number`                   | —              | Total number of items in the parent repeater.      |
| `selected`           | `boolean`                  | —              | Whether this item is bulk-selected.                |
| `selectionMode`      | `boolean`                  | —              | Whether bulk selection mode is active.             |

### Emits

| Event           | Payload                   | Description                         |
| --------------- | ------------------------- | ----------------------------------- |
| `update:item`   | `Record<string, unknown>` | Item data changed.                  |
| `delete`        | —                         | Delete this item.                   |
| `duplicate`     | —                         | Duplicate this item.                |
| `move-up`       | —                         | Move this item one position up.     |
| `move-down`     | —                         | Move this item one position down.   |
| `move-to`       | `index: number`           | Move this item to a specific index. |
| `toggle-select` | —                         | Toggle bulk-selection of this item. |

### Slots

| Slot      | Description                                |
| --------- | ------------------------------------------ |
| `actions` | Custom action buttons in the item toolbar. |

---

## NUI Wrapper Fields

Thin wrappers around Nuxt UI primitives that integrate with the form registry system. They inherit all attributes and props from the underlying Nuxt UI component.

| Component       | Wraps         | Registry keys                                       | Notes                                                                                                                       |
| --------------- | ------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NuiInput`      | `UInput`      | `'text'`, `'email'`, `'url'`, `'number'`, `'color'` | `number`/`email`/`url`/`color` set the native `type` via registry `attrs`.                                                  |
| `NuiTextarea`   | `UTextarea`   | `'textarea'`                                        |                                                                                                                             |
| `NuiSlider`     | `USlider`     | `'slider'`                                          |                                                                                                                             |
| `NuiCheckbox`   | `UCheckbox`   | `'boolean'`                                         |                                                                                                                             |
| `NuiSwitch`     | `USwitch`     | `'switch'`                                          |                                                                                                                             |
| `NuiSelectMenu` | `USelectMenu` | `'select'`                                          | Accepts `items` (`{ label, value }` or strings) and legacy `options` (`{ text, value }`); shapes are normalised internally. |

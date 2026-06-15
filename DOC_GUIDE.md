# DOC_GUIDE — How to Document Mapo v2

This guide describes the style and structure we follow for all Mapo v2 documentation.  
Anyone adding a feature, component, or composable **must** update the docs following these guidelines.

---

## 1. Two layers of documentation

Every feature has **two layers**:

### 1a. Narrative / how-to documentation (VitePress, `docs/`)

This is the doc you read to understand a feature: it explains the "why", the "when", and the "how". It must be understandable by a developer who has never used Mapo before.

**Typical structure of a narrative page:**

```md
# Feature name

Short intro (1–3 lines) explaining what it solves and in which context it is used.

## Quickstart

Minimal working example with code.

## Key concepts

Explanation of relevant internal mechanics (only if non-obvious).

## Advanced examples

Real-world use cases, non-trivial configurations, slots/overrides.

## Notes and limitations

What cannot be done, known workarounds, gotchas.
```

**Style rules:**

- Direct tone, second person ("pass `endpoint` as…", "use `useCrud` to…").
- Code blocks must be complete and copy-pasteable.
- Every option/prop mentioned in the text must link or refer to the API section.
- Do not describe internal implementation details unless they are necessary to use the feature correctly.

---

### 1b. Technical / API Reference documentation

This is the doc you consult as a precise reference: props, emits, slots, parameters, return types. **No narrative prose** — tables only.

**Dedicated files:**

- `docs/uikit/api.md` → all UIKit components
- `docs/uikit/form/api.md` → all Form Engine components
- `docs/modules/api.md` → all composables and utility functions

---

## 2. How to document a Vue component

### Narrative page (e.g. `docs/uikit/list.md`)

Follow the narrative structure above. Include:

- One or more usage examples with `<MapoList ... />`.
- Prose explanation of the most important props.
- Slot examples for advanced cases.
- A link to the API section at the bottom: `→ [Full API](/uikit/api#mapolist)`.

### API section (in `docs/uikit/api.md` or `docs/uikit/form/api.md`)

Each component follows this fixed structure:

```md
## ComponentName

One line describing what it does.

### Props

| Prop       | Type     | Default     | Description   |
| ---------- | -------- | ----------- | ------------- |
| `propName` | `string` | `'default'` | What it does. |

### Emits

| Event        | Payload | Description         |
| ------------ | ------- | ------------------- |
| `event-name` | `T`     | When it is emitted. |

### Slots

| Slot        | Description                                        |
| ----------- | -------------------------------------------------- |
| `slot-name` | What it contains. Available props: `{ foo, bar }`. |

### Exposed Methods (only when `defineExpose` is used)

| Method    | Signature    | Description       |
| --------- | ------------ | ----------------- |
| `refresh` | `() => void` | Reloads the data. |
```

**Rules:**

- The `Default` column must always be present. Use `—` when there is no default.
- Mark **required** props as: `— **required**`.
- For complex types use the TypeScript type name, not the full interface definition (e.g. `FieldDescriptor[]`, not the full interface).
- Union types are written with `\|` to avoid breaking markdown tables (e.g. `string \| null`).

---

## 3. How to document a composable or utility function

All entries go in `docs/modules/api.md`.

Structure for each function:

```md
### `functionName(param1, param2?)`

Short description of what it does (1–2 lines).

| Parameter | Type      | Default        | Description         |
| --------- | --------- | -------------- | ------------------- |
| `param1`  | `string`  | — **required** | What it represents. |
| `param2`  | `boolean` | `false`        | What it controls.   |

**Returns:** `ReturnType` — What the returned value contains.
```

**Rules:**

- The `###` heading uses the full function signature with parameters (e.g. `### \`useCrud(endpoint)\``).
- The `Default` column is mandatory. Use `—` when there is no default; `— **required**` when the parameter is required.
- If the function returns an object with multiple members, add a second table with columns `Member | Type | Description`.
- For Pinia stores: split into three separate tables — State, Getters, and Actions.

---

## 4. Where to put the files

```
docs/
  uikit/
    <feature>.md          ← narrative how-to for each UIKit component
    api.md                ← API reference for all UIKit components and layouts
    form/
      <feature>.md        ← narrative how-to for each Form Engine feature
      api.md              ← API reference for all Form Engine components
  modules/
    core.md               ← narrative for core composables (useCrud, useMapoAuth…)
    store.md              ← narrative for stores
    utils.md              ← narrative for utilities
    api.md                ← API reference for all composables and functions
```

Every new narrative file must be added to the sidebar in `docs/.vitepress/config.mts`.  
The `api.md` files are already in the sidebar — just keep them up to date.

---

## 5. Typography conventions

| Element               | Style                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Component name        | `MapoList`, `MapoDetail` (PascalCase, backtick inline)                    |
| Prop / parameter name | `endpoint`, `modelValue` (camelCase, backtick)                            |
| Event name            | `update:modelValue`, `saved` (backtick)                                   |
| Slot name             | `field.{key}`, `dtable.toolbar` (backtick)                                |
| TypeScript type       | `FieldDescriptor<T>`, `string \| null` (backtick, `\|` escaped in tables) |
| Default value         | `'id'`, `true`, `[]` (backtick)                                           |
| No default            | `—` (em dash)                                                             |
| Required prop/param   | `— **required**`                                                          |
| Link to API section   | `→ [Full API](/uikit/api#mapolist)`                                       |

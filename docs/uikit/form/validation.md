# Validation

Mapo Form runs client-side validation through `validate` / `validateAsync` callbacks declared on each descriptor. Client validation **complements** backend validation — it does not replace it.

## TL;DR

```ts
const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", required: true }, // shorthand
  {
    key: "slug",
    type: "text",
    validate: (v) => (/\s/.test(String(v)) ? "No spaces" : null),
  },
  { key: "email", type: "text", validateAsync: checkEmailAvailable }, // remote check
];
```

`required` and `validate` run on every change, debounced. `validateAsync` runs after a longer debounce and shows a live indicator next to the label.

---

## How to: validate a single field

```ts
{
  key: 'title',
  type: 'text',
  required: true,
  validate: (value) => {
    if (!value) return 'Title is required'
    if (String(value).length < 3) return 'At least 3 characters'
    return null               // null | undefined = valid
  },
}
```

Return value:

- `null` / `undefined` → valid
- `string` → error message shown under the field

## How to: cross-field rules

`validate` receives the form context as its second argument:

```ts
{
  key: 'end_date',
  type: 'date',
  validate: (value, ctx) => {
    if (value && ctx.model.start_date && value < ctx.model.start_date) {
      return 'End date must be after start date'
    }
    return null
  },
}
```

`ctx` matches the shape of `MapoFormContext`: `{ model, errors, currentLang, isDirty, … }`.

## How to: combine `required` with `validate`

`required: true` adds an automatic empty-value check, equivalent to:

```ts
validate: (v) => (v == null || v === "" ? "Field is required" : null);
```

If you also pass a custom `validate`, both run — `required` first, then `validate`. You only need to handle the non-empty cases inside `validate`.

## How to: trigger validation manually

```ts
const form = useMapoForm({ model, fields, registry });

async function save() {
  const { valid, errors } = form.validateClient();
  if (!valid) {
    console.log(errors); // { title: 'Title is required', ... }
    return;
  }
  await $fetch("/api/articles/1/", { method: "PATCH", body: form.getPatch() });
}
```

`form.submit(handler)` already calls `validateClient()` internally — if it fails, the handler is not invoked and `isLoading` stays `false`. You only need to call `validateClient()` yourself when bypassing `submit()`.

## How to: surface backend errors

Backend frameworks (DRF, Pydantic) return field-keyed error maps. Bind them to `<MapoForm :errors>`:

```ts
const errors = ref<Record<string, string[]>>({});

try {
  await $fetch("/api/articles/", { method: "POST", body: payload });
} catch (e: any) {
  errors.value = e.data ?? {}; // { title: ['This field is required.'], ... }
}
```

```vue
<MapoForm v-model="article" :fields="fields" :errors="errors" />
```

Errors are displayed under the matching field. Path matching also works for nested keys (`translations.it.title`, `blocks.0.title`).

### Nested error shapes

```json
{
  "translations": {
    "it": { "title": ["This field is required."] }
  },
  "blocks": [null, { "title": ["Too long."] }]
}
```

`MapoFormField` calls `resolveErrors(errorsMap, 'translations.it.title')` internally, walking every segment of the path. You do not need to flatten the error map.

## How to: show error badges on tabs

If a tab contains fields with errors, a red badge is rendered on the tab automatically. This works for both client and backend errors. **No configuration needed** — the tab counts errors via `resolveErrors` for every field declared in the tab.

## How to: validate slugs and identifiers

Common recipe — slug must be lowercase, alphanumeric, and unique:

```ts
{
  key: 'slug',
  type: 'text',
  required: true,
  validate: (v) => {
    if (/\s/.test(String(v))) return 'No spaces allowed'
    if (!/^[a-z0-9-]+$/.test(String(v))) return 'Lowercase letters, digits and dashes only'
    return null
  },
  validateAsync: async (value, ctx) => {
    if (!value) return null
    const { available } = await $fetch('/api/check-slug', {
      params: { slug: value, exclude: ctx.model.id },
    })
    return available ? null : 'Slug already in use'
  },
}
```

Sync validation runs first; async validation only fires when sync is clean.

## How to: validate against the model state

Conditional rules that depend on other field values:

```ts
{
  key: 'price',
  type: 'number',
  validate: (v, ctx) => {
    const n = Number(v)
    if (isNaN(n) || n < 0) return 'Price must be positive'
    if (ctx.model.is_premium && n < 10) return 'Premium content costs at least €10'
    return null
  },
}
```

## Async validation

For checks that need a server round-trip (slug uniqueness, FK existence), use `validateAsync`:

```ts
{
  key: 'slug',
  type: 'text',
  validateAsync: async (value, ctx) => {
    if (!value) return null
    const { available } = await $fetch('/api/check-slug', {
      params: { slug: value, exclude: ctx.model.id },
    })
    return available ? null : 'Slug already in use'
  },
  validateAsyncDebounce: 600,  // ms — default: 600
}
```

Behavior:

- Debounced per-field on every change (default 600 ms).
- Visual indicator in the field label:
  - `i-lucide-loader-2` (spinning) — running
  - `i-lucide-check-circle` (green) — valid
  - `i-lucide-x-circle` (red) — invalid
- Results are cached in memory keyed by value, so a value already validated does not re-fire the request.
- The async error joins the field's regular error list — backend, sync, and async errors render in the same component.

### Gotcha — `validateAsync` does not block `submit()`

`validateAsync` is advisory, not blocking. If the user hits Save before the async check completes, `submit()` proceeds with whatever sync state is current. Block manually if uniqueness is critical:

```ts
async function save() {
  if (form.isAsyncValidating?.value) {
    snack.show("Wait for validation to finish", "warning");
    return;
  }
  await form.submit(handler);
}
```

---

## Complete recipe

```ts
const fields: FieldDescriptor<Article>[] = [
  {
    key: "slug",
    type: "text",
    required: true,
    validate: (v) => {
      if (/\s/.test(String(v))) return "No spaces allowed";
      if (!/^[a-z0-9-]+$/.test(String(v)))
        return "Lowercase, digits, dashes only";
      return null;
    },
    validateAsync: async (v, ctx) => {
      if (!v) return null;
      const { available } = await $fetch("/api/check-slug", {
        params: { slug: v, exclude: ctx.model.id },
      });
      return available ? null : "Slug already in use";
    },
  },
  {
    key: "price",
    type: "number",
    validate: (v, ctx) => {
      const n = Number(v);
      if (isNaN(n) || n < 0) return "Price must be positive";
      if (ctx.model.is_premium && n < 10)
        return "Premium content costs at least €10";
      return null;
    },
  },
];
```

## Pitfalls

- **Returning `false` does not mean invalid** — only a string error message counts. `return false` is treated as valid (falsy).
- **Don't throw inside `validate`** — exceptions bubble up and break the form. Always return `null` or a string.
- **Avoid expensive sync work** — `validate` runs on every change. Move database/API checks to `validateAsync`.
- **`required` only checks empty** — it does not check `0`, `false`, or `[]`. Add a custom `validate` if those should fail.

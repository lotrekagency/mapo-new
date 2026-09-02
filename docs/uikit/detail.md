# MapoDetail

`<MapoDetail>` is the admin record-edit shell. It owns the full CRUD lifecycle — fetch, save (PATCH or PUT), delete, validation, language tabs, unsaved-changes guard — and exposes a two-column layout (main + sticky sidebar) driven by `FieldDescriptor[]`.

## TL;DR

```vue
<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

interface Article {
  id: number;
  slug: string;
  is_active: boolean;
  translations: Record<string, { title: string; body: string }>;
}

const route = useRoute();

const mainFields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", translatable: true, required: true },
  { key: "body", type: "editor", translatable: true },
];

const sidebarFields: FieldDescriptor<Article>[] = [
  { key: "slug", type: "text", required: true },
  { key: "is_active", type: "switch", label: "Active" },
];
</script>

<template>
  <MapoDetail
    endpoint="/api/articles"
    :id="route.params.id"
    :fields="mainFields"
    :sidebar-fields="sidebarFields"
    :languages="['it', 'en']"
    model-name="Article"
  />
</template>
```

The page now supports:

- Loading the record (or a blank model when `id === 'new'`)
- Saving via PATCH (diff only) or PUT (full body), depending on `usePatch`
- Saving + continuing on the same record
- Going back without losing unsaved edits (confirmation prompt)
- Deleting with confirmation
- Switching languages with a per-language error badge
- Surfacing 400 validation errors under the right field

---

## Props

| Prop                           | Type                             | Default       | Description                                                                                                                                                                                           |
| ------------------------------ | -------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`                     | `string`                         | —             | REST endpoint for `useCrud`                                                                                                                                                                           |
| `id`                           | `string \| number`               | —             | Record id; pass `'new'` for create mode                                                                                                                                                               |
| `fields`                       | `FieldDescriptor<T>[]`           | —             | Body form fields. Optional only when `experimentalFieldsFromSchema` supplies them.                                                                                                                    |
| `experimentalFieldsFromSchema` | `boolean`                        | `false`       | Derive the body fields from the `schema` on the endpoint's OPTIONS response when `fields` is not given.                                                                                               |
| `schemaFieldOptions`           | `UseFormFromSchemaOptions`       | —             | Passed straight to `useFormFromSchema` when deriving.                                                                                                                                                 |
| `sidebarFields`                | `FieldDescriptor<T>[]`           | `[]`          | Sidebar form fields                                                                                                                                                                                   |
| `languages`                    | `string[]`                       | `[]`          | Translation language codes (e.g. `['it', 'en']`)                                                                                                                                                      |
| `modelName`                    | `string`                         | —             | Human-readable name for the page title                                                                                                                                                                |
| `sidebarCols`                  | `number`                         | `4`           | Sidebar column span on a 12-col grid                                                                                                                                                                  |
| `sticky`                       | `boolean`                        | `true`        | Keep the sidebar sticky while scrolling                                                                                                                                                               |
| `usePatch`                     | `boolean`                        | `true`        | Send PATCH (diff only) on update; otherwise PUT                                                                                                                                                       |
| `readonly`                     | `boolean`                        | `false`       | Force read-only mode                                                                                                                                                                                  |
| `registry`                     | `FieldRegistry`                  | auto-injected | Optional registry override                                                                                                                                                                            |
| `draft`                        | `boolean`                        | `false`       | Enable auto-save draft to localStorage. Key is auto-generated as `${endpoint}:${id}`.                                                                                                                 |
| `draftKey`                     | `string`                         | —             | Custom localStorage key for draft persistence. Requires `draft: true`. Prefix: `mapo:draft:`.                                                                                                         |
| `multipart`                    | `"auto" \| "force" \| "disable"` | `"auto"`      | Controls multipart/form-data upload behaviour. `"auto"` uses multipart only when the model contains a `File` or `Blob`; `"force"` always uses it; `"disable"` never does.                             |
| `permissionModel`              | `string`                         | —             | Django model label (e.g. `"news.article"`). When set, save buttons are hidden if the user lacks `add_*` / `change_*`, and the delete card is hidden without `delete_*`. Superusers are never blocked. |
| `previewField`                 | `string`                         | —             | Model field that holds a public URL. When set a **Preview** button appears in the sidebar; clicking it opens a sandboxed iframe modal.                                                                |
| `forceLanguages`               | `string[]`                       | —             | Override the language list regardless of the `languages` prop or the `lang_info` returned by the endpoint's OPTIONS response. Useful for per-model language subsets.                                  |

The `registry` prop is optional — `<MapoDetail>` resolves `$mapoFormRegistry` automatically.

## Emits

| Event         | Payload                              | When                                                                                                                                |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `saved`       | the saved model                      | After a successful save                                                                                                             |
| `deleted`     | —                                    | After a successful delete                                                                                                           |
| `draft-found` | `(draft, savedAt, restore, discard)` | After fetch when a valid draft exists. The built-in banner handles this automatically; listen only for side-effects (e.g. a toast). |

---

## How to: create vs edit

The component decides based on the `id` value:

```vue
<!-- Edit -->
<MapoDetail :id="route.params.id" … />

<!-- Create -->
<MapoDetail id="new" … />
```

When `id === 'new'`, `<MapoDetail>` skips the initial fetch, starts with an empty model, and submits a POST to the endpoint on save. After creation it routes to the edit URL of the new record.

## How to: split fields between main and sidebar

```ts
const mainFields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", translatable: true, required: true },
  { key: "body", type: "editor", translatable: true },
];

const sidebarFields: FieldDescriptor<Article>[] = [
  { key: "is_active", type: "switch" },
  { key: "published_at", type: "datetime" },
  { key: "category", type: "fks", attrs: { endpoint: "/api/categories/" } },
];
```

```vue
<MapoDetail
  :fields="mainFields"
  :sidebar-fields="sidebarFields"
  :sidebar-cols="3"
  …
/>
```

The split is purely visual; both groups share the same model. `getPatch()` diffs across both.

## How to: derive the fields from the backend schema (experimental)

```vue
<MapoDetail
  endpoint="/api/articles/"
  :id="route.params.id"
  :experimental-fields-from-schema="true"
/>
```

With `experimentalFieldsFromSchema` on and no `fields` prop, `<MapoDetail>` builds the body form from the `schema` published on the endpoint's `OPTIONS` response. `schemaFieldOptions` is forwarded to `useFormFromSchema` untouched.

A derived form knows types, labels, relations and what is read-only — but nothing editorial: no tabs, no column widths, no rich-text vs textarea, no sidebar split, and no opinion about field order beyond the serializer's. Treat it as a scaffold to start from, not a finished panel.

- Requires a backend that publishes `schema` on OPTIONS (camomilla >= 6.6).
- An explicit `fields` prop always wins — the derived set never overrides a hand-built form.

## How to: handle multilingual content

```vue
<MapoDetail :languages="['it', 'en']" :fields="mainFields" … />
```

`<MapoDetailLangSwitch>` renders above the body. Each tab shows a red error badge when at least one field inside `translations.<lang>.*` has an error. The `?lang=` query param is kept in sync — language deep-links work out of the box.

**Many languages** — when the number of languages exceeds `langThreshold` (default `8`), the tab bar is automatically replaced with a searchable `USelectMenu`. The threshold is configurable:

```vue
<!-- Force select menu from 4+ languages -->
<MapoDetail :languages="langs" :lang-threshold="4" … />
```

Pass `:lang-threshold="Infinity"` to always use the tab bar regardless of how many languages there are.

## How to: customize the sidebar buttons

The sidebar renders two separate areas:

1. **Action card** (`#side-buttons`) — Save, Save & continue, Back.
2. **Danger card** (`#side-danger`) — Delete, shown only for existing records, visually separated at the bottom of the sidebar.

Override individual buttons with the matching slot:

```vue
<MapoDetail :id="id" :fields="fields">
  <template #button-save="{ save, isSaving, isDirty }">
    <UButton :loading="isSaving" :disabled="!isDirty" color="primary" @click="save">
      Save changes
    </UButton>
  </template>

  <!-- Override just the delete button inside the danger card -->
  <template #button-delete="{ deleteItem }">
    <UButton variant="ghost" color="error" @click="deleteItem">
      Move to trash
    </UButton>
  </template>
</MapoDetail>
```

Replace the whole action card (Save/Back) or the danger card entirely:

```vue
<!-- Replace Save/Back card -->
<template #side-buttons="{ save, isDirty, isSaving }">
  <UCard>
    <UButton :loading="isSaving" :disabled="!isDirty" block @click="save"
      >Publish</UButton
    >
    <UButton variant="ghost" block @click="$router.back()">Back</UButton>
  </UCard>
</template>

<!-- Suppress the delete card entirely -->
<template #side-danger />
```

## How to: add custom sidebar / body sections

```vue
<MapoDetail :id="id" :fields="fields">
  <!-- Above body fields -->
  <template #body-top="{ model }">
    <UAlert v-if="model.is_outdated" color="warning" title="This article is outdated" />
  </template>

  <!-- Below body fields -->
  <template #body-bottom>
    <RelatedArticles :id="id" />
  </template>

  <!-- Sidebar header (above sidebar form) -->
  <template #side-top="{ model }">
    <UCard>
      <p class="text-sm">Author: <strong>{{ model.author_name }}</strong></p>
    </UCard>
  </template>

  <!-- Sidebar footer (below sidebar form) -->
  <template #side-bottom>
    <RevisionHistory :endpoint="`/api/articles/${id}/revisions/`" />
  </template>
</MapoDetail>
```

## How to: pass field-level slots through

`<MapoDetail>` forwards `field.<key>.*` and `group.<name>.*` slots to the inner `<MapoForm>` instances.

**Per-field sub-slots** — injected within the field's grid cell:

```vue
<!-- Append a button inside the slug field -->
<template #field.slug.append="{ model }">
  <UButton size="xs" @click="model.slug = slugify(model.title)">Auto</UButton>
</template>

<!-- Inject content before a field (within its column) -->
<template #field.excerpt.before>
  <p class="text-xs text-muted mb-1">Keep under 160 characters for SEO.</p>
</template>

<!-- Inject content after a field (within its column) -->
<template #field.excerpt.after>
  <UBadge>{{ model.excerpt?.length ?? 0 }}/160</UBadge>
</template>
```

**Per-group slots** — wrap an entire group card:

```vue
<!-- Banner above a named group -->
<template #group.seo.before>
  <UAlert
    color="info"
    title="SEO fields"
    description="Filled automatically if left blank."
  />
</template>

<!-- Content below a group card -->
<template #group.seo.after>
  <p class="text-xs text-muted">Changes apply on next publish.</p>
</template>
```

See [Form slots](./form/slots) for the complete list.

## How to: react to save / delete

```vue
<MapoDetail
  :id="id"
  :fields="fields"
  endpoint="/api/articles/"
  @saved="onSaved"
  @deleted="onDeleted"
/>

<script setup lang="ts">
function onSaved(article: Article) {
  // e.g. invalidate a cache, push analytics
  $analytics.track("article_saved", { id: article.id });
}
function onDeleted() {
  navigateTo("/articles");
}
</script>
```

## How to: enable draft auto-save

Pass `:draft="true"` to activate automatic draft persistence. The component debounces saves to localStorage every 2 s while the form is dirty and shows a built-in restore banner on the next load.

```vue
<MapoDetail
  :id="route.params.id"
  endpoint="/api/articles"
  :draft="true"
  :fields="fields"
/>
```

On the next page load a `UAlert` banner appears automatically offering **Restore** / **Discard**. No extra code needed.

**Custom key** — by default the key is `${endpoint}:${id}` (e.g. `/api/articles:42`). Override it when the default key is not unique enough:

```vue
<MapoDetail :draft="true" draft-key="article:42" … />
```

**Custom banner UI** — override the `draft-banner` slot to replace the default `UAlert`:

```vue
<MapoDetail :draft="true" …>
  <template #draft-banner="{ draftBanner }">
    <div v-if="draftBanner" class="my-banner">
      Draft from {{ draftBanner.savedAt.toLocaleString() }}
      <button @click="draftBanner.restore()">Restore</button>
      <button @click="draftBanner.discard()">Discard</button>
    </div>
  </template>
</MapoDetail>
```

**Suppress the banner** — pass an empty template:

```vue
<template #draft-banner />
```

Drafts expire automatically after 24 h and are cleared from localStorage on successful save.

## How to: choose PATCH vs PUT

`usePatch` is `true` by default. `<MapoDetail>` sends only the diff between the loaded model and the current one (`getPatch()` from `useMapoForm`).

Disable when the backend cannot accept partial updates:

```vue
<MapoDetail :id="id" :fields="fields" :use-patch="false" />
```

---

## Slots reference

Every slot receives the same `slotBindings` object:

```ts
interface DetailSlotProps<T> {
  model: T;
  errors: Record<string, string[]>;
  currentLang: string;
  isNew: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isDirty: boolean;
  readonly: boolean; // true when the form is read-only (forced or permission-denied)
  canDelete: boolean; // false when permissionModel is set and the user lacks delete_*
  draftBanner: {
    savedAt: Date;
    restore: () => void;
    discard: () => void;
  } | null;
  save: (andBack?: boolean) => Promise<void>;
  deleteItem: () => Promise<void>;
  back: () => void;
}
```

| Slot                                                     | Replaces / adds                                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#draft-banner`                                          | The draft restore banner (shown automatically when `draftKey` is set and a draft exists). Override for a custom UI; pass an empty template to suppress it. |
| `#title`                                                 | The page title                                                                                                                                             |
| `#body`                                                  | The entire body form (advanced — usually not needed)                                                                                                       |
| `#body-lang`                                             | The language switch above the body                                                                                                                         |
| `#body-top`                                              | Section above the body fields                                                                                                                              |
| `#body-bottom`                                           | Section below the body fields                                                                                                                              |
| `#side-buttons`                                          | The Save / Save & continue / Back action card                                                                                                              |
| `#button-save` / `#button-savecontinue` / `#button-back` | Single buttons inside the action card                                                                                                                      |
| `#side-top`                                              | Section above the sidebar form fields                                                                                                                      |
| `#side-bottom`                                           | Section below the sidebar form fields, above the danger card                                                                                               |
| `#side-danger`                                           | The danger card at the bottom (Delete button). Shown only for existing records. Pass an empty template to suppress it.                                     |
| `#button-delete`                                         | The Delete button inside `#side-danger`                                                                                                                    |
| `#field.<key>`                                           | Replace the entire field cell                                                                                                                              |
| `#field.<key>.before` / `#field.<key>.after`             | Content injected before / after the field widget within its grid column                                                                                    |
| `#field.<key>.label` / `.hint` / `.append` / `.prepend`  | UFormField sub-slots forwarded to `<MapoForm>`                                                                                                             |
| `#group.<name>.before` / `#group.<name>.after`           | Content injected before / after a named group card                                                                                                         |

## How to: gate with permissions

Pass the Django app-model label to automatically hide the save buttons and delete card for users who lack the necessary permissions:

```vue
<MapoDetail
  endpoint="/api/articles/"
  :id="route.params.id"
  :fields="fields"
  permission-model="news.article"
/>
```

Behaviour:

- **Create mode** (`id === 'new'`) — save buttons are hidden if the user lacks `add_article`.
- **Edit mode** — save buttons are hidden if the user lacks `change_article`.
- **Delete card** — hidden if the user lacks `delete_article`.
- Superusers bypass all permission checks.

The `readonly` and `canDelete` bindings are also exposed on every slot so you can conditionally render extra UI based on the effective permission:

```vue
<MapoDetail permission-model="news.article" …>
  <template #body-top="{ readonly }">
    <UAlert v-if="readonly" color="warning" title="Read-only — you don't have edit permission." />
  </template>
</MapoDetail>
```

---

## How to: preview the published page

Pass the model field that contains the public URL and a **Preview** button appears in the sidebar. Clicking it opens a sandboxed iframe so the editor can see the live page without leaving the admin:

```vue
<MapoDetail
  endpoint="/api/articles/"
  :id="route.params.id"
  :fields="fields"
  preview-field="absolute_url"
/>
```

The URL is read reactively from `model[previewField]`. If the value is `null`, empty, or not a string the button is not shown.

---

## How to: auto-derive languages from the backend

`<MapoDetail>` asks the endpoint to describe itself with a single `OPTIONS` call on mount — independently of the record fetch, so a create form gets its tabs too — and reads the language list from the `lang_info` of that response:

```vue
<!-- No :languages prop needed — derived from lang_info on OPTIONS -->
<MapoDetail endpoint="/api/articles/" :id="route.params.id" :fields="fields" />
```

Language priority chain:

1. `forceLanguages` prop (always wins)
2. `languages` prop (non-empty array)
3. `lang_info.languages` from the endpoint's OPTIONS response

`lang_info.languages` describes the **model**, not the site. `lang_info.site_languages` is context only and is **never** used: a model whose `lang_info.translatable` is `false`, or which has no `lang_info` at all, renders no language switcher. A multilingual site can still expose models nobody registered for translation, and tabs on those invite the editor to type values the backend drops on save.

**Behaviour change** — pages that relied on site-wide tabs appearing for every model must now pass `languages` or `forceLanguages` explicitly.

Use `forceLanguages` when you need to restrict the editor to a subset of the site languages for a specific model:

```vue
<!-- Only English and Italian, regardless of the backend language list -->
<MapoDetail :force-languages="['en', 'it']" … />
```

---

## How to: control multipart uploads

`multipart` defaults to `"auto"` — the component detects `File` / `Blob` values in the model and switches to `multipart/form-data` automatically. Override when needed:

```vue
<!-- Always use multipart (e.g. model has a file field not detectable as File) -->
<MapoDetail multipart="force" … />

<!-- Never use multipart (e.g. backend only accepts JSON) -->
<MapoDetail multipart="disable" … />
```

---

## Pitfalls

- **`id` prop expects `'new'`, not `0` or `null`** — for create mode, pass the literal string. Nuxt's route param will already be `'new'` if you wire the URL as `/articles/new`.
- **PATCH semantics** — the diff is computed against the snapshot taken at fetch time. If something else mutates `model` outside `<MapoDetail>` (e.g. a parent component), the diff may include unintended changes.
- **Leaving with unsaved edits** — the guard hooks both `onBeforeRouteLeave` and `window.beforeunload`. Avoid replacing `<MapoDetail>` in tests with a stub that does not propagate the `isDirty` state, or you will lose the warning.
- **Sidebar errors** — sidebar fields share the same error map as the body. A 400 on a sidebar field renders inside the sidebar form, not the body — keep the descriptor `key` consistent with the API payload so the matcher finds it.

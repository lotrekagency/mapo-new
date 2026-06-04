# Draft autosave

`useFormDraft` saves the model to `localStorage` every 2 seconds (debounced) while the form has unsaved changes. On the next mount, if a valid draft exists, it calls `onRestore` so you can prompt the user to restore it.

## TL;DR

```ts
const form = useMapoForm({ model, fields, registry });

const { clearDraft } = useFormDraft({
  model,
  isDirty: form.isDirty,
  key: `article:${route.params.id ?? "new"}`,
  onRestore(draft, savedAt) {
    if (
      window.confirm(`Draft from ${savedAt.toLocaleString()} found. Restore?`)
    ) {
      model.value = draft;
    }
  },
});

async function save() {
  await form.submit(async (payload, isNew) => {
    await $fetch("/api/articles/", {
      method: isNew ? "POST" : "PATCH",
      body: payload,
    });
    clearDraft();
  }, isNew);
}
```

---

## Options

| Option      | Type                       | Default      | Description                                         |
| ----------- | -------------------------- | ------------ | --------------------------------------------------- |
| `model`     | `Ref<T>`                   | —            | Reactive model to persist                           |
| `isDirty`   | `Ref<boolean>`             | —            | Only persists while the form is dirty               |
| `key`       | `string`                   | —            | Unique key (prefixed with `mapo:draft:` internally) |
| `debounce`  | `number`                   | `2000`       | ms between writes                                   |
| `ttl`       | `number`                   | `86_400_000` | ms before the draft expires (24h)                   |
| `onRestore` | `(draft, savedAt) => void` | —            | Called at mount when a valid draft exists           |

## API

```ts
const { clearDraft, getDraft, hasDraft } = useFormDraft({ ... })

clearDraft()          // delete the persisted draft (call after a successful save)
const entry = getDraft()  // { model: T, savedAt: number } | null
if (hasDraft()) { … }
```

## How to: prompt the user with a non-blocking banner

```vue
<script setup lang="ts">
const hasDraftBanner = ref(false);
let pendingDraft: ArticleModel | null = null;

const { clearDraft } = useFormDraft({
  model,
  isDirty: form.isDirty,
  key: `article:${id}`,
  onRestore(draft) {
    pendingDraft = draft;
    hasDraftBanner.value = true;
  },
});

function restoreDraft() {
  if (pendingDraft) model.value = pendingDraft;
  hasDraftBanner.value = false;
}

function dismissDraft() {
  hasDraftBanner.value = false;
  clearDraft();
}
</script>

<template>
  <Transition name="slide-down">
    <UAlert
      v-if="hasDraftBanner"
      icon="i-lucide-clock"
      color="warning"
      variant="soft"
      title="Unsaved draft found"
      description="Do you want to restore your previous changes?"
    >
      <template #actions>
        <UButton size="xs" @click="restoreDraft">Restore</UButton>
        <UButton size="xs" variant="ghost" @click="dismissDraft"
          >Discard</UButton
        >
      </template>
    </UAlert>
  </Transition>

  <MapoForm v-model="article" :fields="fields" />
</template>
```

## How to: scope drafts per-record

Use a unique `key` per resource id:

```ts
useFormDraft({
  model,
  isDirty: form.isDirty,
  key: `article:${route.params.id ?? 'new'}`,   // ← unique per id, plus 'new' for create
  onRestore: …,
})
```

Use `:new` for create flows so a fresh-start session does not collide with a previously interrupted draft for an existing record.

## How to: drop the draft after a save

Always call `clearDraft()` from inside the submit handler after a successful save — otherwise the draft stays in `localStorage` and prompts the user on the next visit:

```ts
await form.submit(async (payload, isNew) => {
  await $fetch("/api/articles/", {
    method: isNew ? "POST" : "PATCH",
    body: payload,
  });
  clearDraft();
}, isNew);
```

## How to: tune the debounce for fast typists

For very large forms, lower the persist frequency to avoid `localStorage` write churn:

```ts
useFormDraft({
  model,
  isDirty: form.isDirty,
  key,
  debounce: 5000, // 5s — write much less often
});
```

## Pitfalls

- **Persists when `isDirty` is true** — make sure the dirty state actually flips. Use `useMapoForm({ immediate: true })` if you want dirty tracking to start before the first edit.
- **Per-tab isolation does not exist** — two tabs editing the same record will overwrite each other's drafts. If multi-tab editing matters, consider `BroadcastChannel` to coordinate.
- **`localStorage` is synchronous** — large models (50+ kB) can stutter on slow devices. Strip large blobs (file inputs, base64 images) before storing.
- **Drafts survive logout** — they are tied to the browser, not the user session. If users share a device, scope `key` with a user identifier.

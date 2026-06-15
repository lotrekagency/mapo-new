# Feedback: Snackbar & Confirm Dialog

Mapo provides two global feedback mechanisms — snack notifications and confirmation dialogs — driven by Pinia stores. Both are mounted once by `MapoRootComponents` inside the `mapo-default` layout and are available to every page.

## MapoSnackBar

`MapoSnackBar` watches `useSnackStore().messages` and bridges each entry to Nuxt UI's `useToast` + `<UNotifications />`. Multiple toasts can be active simultaneously — each `show()` call appends a new one to the queue. Any page or composable can trigger a toast by calling `useSnackStore().show(...)`.

### Usage

```vue
<script setup lang="ts">
const snack = useSnackStore();
</script>

<template>
  <UButton @click="snack.show('Saved!', 'success')">Save</UButton>
  <UButton @click="snack.show('Something went wrong.', 'error')">Fail</UButton>
</template>
```

### `useSnackStore` API

```ts
const snack = useSnackStore();

snack.show(message, type?, duration?)
// message  string    — toast text
// type     SnackType — 'success' | 'error' | 'warning' | 'info'  (default: 'info')
// duration number    — milliseconds before auto-dismiss            (default: 4000)

snack.dismiss()      // remove the last message in the queue
snack.dismiss(id)    // remove a specific message by numeric id
snack.dismissAll()   // clear all messages at once

snack.messages       // SnackMessage[] — full active queue
snack.current        // SnackMessage | null — last message (getter, backward compat)
```

### Notification types

| Type        | Color        | Use case                  |
| ----------- | ------------ | ------------------------- |
| `'success'` | Green        | Operation completed       |
| `'error'`   | Red          | Failure, validation error |
| `'warning'` | Yellow       | Non-blocking caution      |
| `'info'`    | Blue/neutral | General information       |

### How to use it in an async action

```ts
const snack = useSnackStore();

async function save() {
  try {
    await api.post("/articles/", payload);
    snack.show("Article saved.", "success");
  } catch {
    snack.show("Failed to save article.", "error");
  }
}
```

### Where notifications render

`MapoSnackBar` renders `<UNotifications />` — the Nuxt UI notification container. Its position and styling can be customized via the `uikit.ui` Nuxt UI component config:

```ts
// nuxt.config.ts
mapo: {
  uikit: {
    ui: {
      notifications: {
        position: "bottom-right",
      },
    },
  },
},
```

---

## MapoConfirmDialog

`MapoConfirmDialog` renders a `<UModal>` driven by `useConfirmStore`. Call `confirm.ask(options)` and `await` the promise — it resolves `true` if the user confirms and `false` if they cancel.

### Usage

```vue
<script setup lang="ts">
const confirm = useConfirmStore();
const snack = useSnackStore();

async function deleteItem(id: number) {
  const ok = await confirm.ask({
    title: "Delete article",
    message: "This action cannot be undone.",
    confirmText: "Delete",
    cancelText: "Cancel",
    dangerous: true,
  });

  if (!ok) return;

  await api.delete(`/articles/${id}/`);
  snack.show("Article deleted.", "success");
}
</script>

<template>
  <UButton color="error" @click="deleteItem(article.id)">Delete</UButton>
</template>
```

### `useConfirmStore` API

```ts
const confirm = useConfirmStore();

const confirmed: boolean = await confirm.ask(options);
```

**`ConfirmOptions`:**

| Field         | Type      | Default     | Description                                                |
| ------------- | --------- | ----------- | ---------------------------------------------------------- |
| `title`       | `string`  | `"Confirm"` | Dialog heading                                             |
| `message`     | `string`  | —           | Body text explaining the action                            |
| `confirmText` | `string`  | `"Confirm"` | Label of the confirm button                                |
| `cancelText`  | `string`  | `"Cancel"`  | Label of the cancel button                                 |
| `dangerous`   | `boolean` | `false`     | When `true`, the confirm button renders in `color="error"` |

### The dialog is non-dismissible

Clicking outside or pressing Escape does not close the confirm dialog. The user must explicitly click Confirm or Cancel. This prevents accidental dismissal of critical actions.

### Pattern: wrapping in a composable

For reusable confirm flows, extract to a composable:

```ts
// composables/useDeleteConfirm.ts
export function useDeleteConfirm() {
  const confirm = useConfirmStore();
  const snack = useSnackStore();

  async function confirmDelete(label: string): Promise<boolean> {
    return confirm.ask({
      title: `Delete ${label}`,
      message: `"${label}" will be permanently removed.`,
      confirmText: "Delete",
      dangerous: true,
    });
  }

  return { confirmDelete };
}
```

```vue
<script setup lang="ts">
const { confirmDelete } = useDeleteConfirm();

async function remove() {
  if (await confirmDelete("Homepage article")) {
    await api.delete("/articles/1/");
  }
}
</script>
```

---

## MapoRootComponents

`MapoRootComponents` is a zero-template component that mounts both `MapoSnackBar` and `MapoConfirmDialog`:

```vue
<!-- Rendered automatically inside mapo-default layout -->
<MapoRootComponents />
<!-- expands to: -->
<MapoSnackBar />
<MapoConfirmDialog />
```

If you build a custom layout without `mapo-default`, add `<MapoRootComponents />` once at the root of your layout to get snackbar and confirm support:

```vue
<!-- layouts/custom.vue -->
<template>
  <div>
    <slot />
    <MapoRootComponents />
  </div>
</template>
```

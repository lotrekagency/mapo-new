# Feedback: toasts & dialogs

How to show snackbar notifications and confirmation dialogs using `useSnackStore` and `useConfirmStore`.

## Toasts (snackbar)

```vue
<script setup lang="ts">
const snack = useSnackStore();
</script>

<template>
  <UButton @click="snack.show('Article saved.', 'success')">Save</UButton>
  <UButton @click="snack.show('Something went wrong.', 'error')">Fail</UButton>
</template>
```

### All notification types

```ts
snack.show("Operation completed.", "success"); // green
snack.show("Could not save.", "error"); // red
snack.show("Check your input.", "warning"); // yellow
snack.show("Loading data…", "info"); // neutral (default)
```

### Custom duration

```ts
snack.show("Auto-saved.", "success", 2000); // disappears after 2 s
snack.show("Session expiring.", "warning", 10000);
```

### In async actions

Wrap any async operation and show feedback based on the result:

```ts
const snack = useSnackStore();

async function save() {
  try {
    await $fetch("/api/articles", { method: "POST", body: payload });
    snack.show("Article created.", "success");
    navigateTo("/articles");
  } catch {
    snack.show("Failed to create article.", "error");
  }
}
```

### API

```ts
snack.show(message, type?, duration?)   // add a toast to the queue
snack.dismiss()                          // remove the last toast
snack.dismiss(id)                        // remove a specific toast by id
snack.dismissAll()                       // clear all active toasts
snack.messages                           // SnackMessage[] — full queue
snack.current                            // SnackMessage | null — last message (getter)
```

| Param      | Type                                          | Default  |
| ---------- | --------------------------------------------- | -------- |
| `message`  | `string`                                      | required |
| `type`     | `'success' \| 'error' \| 'warning' \| 'info'` | `'info'` |
| `duration` | `number` (ms)                                 | `4000`   |

## Confirmation dialogs

`confirm.ask()` returns a promise that resolves when the user clicks either button. The dialog is **not dismissible** — clicking outside or pressing Escape does nothing.

```vue
<script setup lang="ts">
const confirm = useConfirmStore();
const snack = useSnackStore();

async function deleteArticle(id: number) {
  const ok = await confirm.ask({
    title: "Delete article",
    message: "This action cannot be undone.",
    confirmText: "Delete",
    cancelText: "Cancel",
    dangerous: true, // confirm button turns red
  });

  if (!ok) return;

  await $fetch(`/api/articles/${id}`, { method: "DELETE" });
  snack.show("Article deleted.", "success");
  navigateTo("/articles");
}
</script>

<template>
  <UButton color="error" @click="deleteArticle(article.id)">Delete</UButton>
</template>
```

### Standard (non-dangerous) confirm

```ts
const ok = await confirm.ask({
  title: "Publish article",
  message: "This article will be visible to all users.",
  confirmText: "Publish",
  cancelText: "Not yet",
});
```

### API

```ts
confirm.ask(options): Promise<boolean>
```

| Option        | Type      | Default     | Description          |
| ------------- | --------- | ----------- | -------------------- |
| `title`       | `string`  | `"Confirm"` | Dialog heading       |
| `message`     | `string`  | —           | Body text            |
| `confirmText` | `string`  | `"Confirm"` | Confirm button label |
| `cancelText`  | `string`  | `"Cancel"`  | Cancel button label  |
| `dangerous`   | `boolean` | `false`     | Red confirm button   |

## Reusable delete confirm composable

Extract the pattern into a composable when you need it on multiple pages:

```ts
// composables/useDeleteConfirm.ts
export function useDeleteConfirm() {
  const confirm = useConfirmStore();
  const snack = useSnackStore();

  async function confirmDelete(label: string): Promise<boolean> {
    return confirm.ask({
      title: `Delete ${label}`,
      message: `"${label}" will be permanently removed. This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      dangerous: true,
    });
  }

  function notifyDeleted(label: string) {
    snack.show(`${label} deleted.`, "success");
  }

  return { confirmDelete, notifyDeleted };
}
```

Use it on any page:

```vue
<script setup lang="ts">
const { confirmDelete, notifyDeleted } = useDeleteConfirm();
const articles = useCrud<Article>("/api/articles/");

async function remove(article: Article) {
  if (!(await confirmDelete(article.title))) return;
  await articles.delete(article.id);
  notifyDeleted(article.title);
}
</script>
```

## Using the facade

`useMapo()` aggregates the stores; they are exposed as `$snack` and `$confirm`:

```ts
const { $snack, $confirm } = useMapo();

$snack.show("Saved!", "success");
$snack.show("Failed.", "error");
$snack.show("Loading…", "info");
$snack.show("Check your input.", "warning");

const ok = await $confirm.ask({
  title: "Are you sure?",
  message: "This cannot be undone.",
});
```

## MapoRootComponents

Both `MapoSnackBar` and `MapoConfirmDialog` are mounted by `<MapoRootComponents />`, which is already included in the `mapo-default` layout. You don't need to add them manually — the stores are globally available as soon as Mapo is installed.

→ See also: [Feedback reference](/uikit/feedback), [CRUD detail / form](./crud-detail)

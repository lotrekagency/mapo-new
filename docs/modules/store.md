# @mapomodule/store

Pinia stores for Mapo: auth, snackbar, confirm dialog, and sidebar. All stores are Nuxt-native — they use `useCookie` and `useNuxtApp` internally, so they work correctly in both SSR and client contexts.

## Installation

Included automatically via `@mapomodule/core` and `mapomodule`. For standalone use:

```bash
pnpm add @mapomodule/store
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/store"],
});
```

> **Important — runtime imports**: The main `@mapomodule/store` export resolves to the module entry (`dist/module.mjs`) which imports `@nuxt/kit`. In runtime code (plugins, composables) always use the subpath form:
>
> ```ts
> // Correct — runtime subpath
> import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
>
> // Wrong — imports @nuxt/kit, breaks at runtime
> import { useAuthStore } from "@mapomodule/store";
> ```
>
> In Vue/Nuxt component code and pages, `useAuthStore` is auto-imported and this does not apply.

---

## `useAuthStore`

Manages authentication state. The session credential is an **HttpOnly cookie** managed exclusively by the backend proxy — it is intentionally never stored in client-side Pinia state. Authentication is derived from the presence of a loaded user info object.

```ts
const auth = useAuthStore();

auth.isAuthenticated; // boolean — true when info !== null (derives from setUser being called)
auth.isLoggedIn; // boolean — alias for isAuthenticated
auth.info; // MapoUser | null — full user object returned by the backend
auth.username; // string | null
auth.role; // string | null — first group name
auth.rawPermissions; // string[] — raw codenames, e.g. ['view_article', 'change_article']
auth.modelPermissions; // Record<string, ModelPermissions> — parsed from rawPermissions
auth.pagePermissions; // Record<string, string[]> — reserved for route-level permission rules
```

### Actions

```ts
auth.setUser(user); // populate info + parse permissions → isAuthenticated becomes true
auth.reset(); // clear all state (called on logout and on 401 responses)
```

`setToken` does not exist in v2. The session cookie is HttpOnly — it cannot be read from JavaScript. `isAuthenticated` is derived entirely from whether `setUser` has been called.

### `MapoUser` shape

```ts
interface MapoUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  groups: string[];
  user_permissions: string[];
  all_permissions: string[];
  is_superuser: boolean;
  is_staff: boolean;
}
```

### Permission parsing

`setUser` calls `buildModelPermissions(user.all_permissions)` which parses codenames of the form `{action}_{model}` into a typed map:

```ts
// Given: ['view_article', 'change_article']
auth.modelPermissions;
// → { article: { view: true, add: false, change: true, delete: false } }
```

This map is what the `permissions` route middleware reads against `route.meta.permissions`.

---

## `useSnackStore`

Global snackbar / toast notification queue. Multiple toasts can be active simultaneously — each `show()` call appends to the queue.

```ts
const snack = useSnackStore();

snack.show("Saved!", "success");
snack.show("Error", "error", 5000);

snack.dismiss(); // remove the last message
snack.dismiss(id); // remove a specific message by id
snack.dismissAll(); // clear all messages

snack.messages; // SnackMessage[] — full queue
snack.current; // SnackMessage | null — last message (getter, for backward compat)
```

You can also reach the store through the `useMapo()` facade (exposed as `$snack`):

```ts
const { $snack } = useMapo();
$snack.show("Saved!", "success");
$snack.show("Could not save", "error");
$snack.show("Loading...", "info");
```

> **Note**: `useSnackStore().show(message, type, duration?)` takes positional arguments, not an object.

---

## `useConfirmStore`

Programmatic confirm dialog.

```ts
const confirm = useConfirmStore();

const ok = await confirm.ask({
  title: "Delete item?",
  message: "This action cannot be undone.",
  confirmText: "Delete",
  cancelText: "Cancel",
  dangerous: true,
});

if (ok) {
  await articles.delete(id);
}
```

`ConfirmOptions`: `{ title?, message, confirmText?, cancelText?, dangerous? }` — `message` is required; `dangerous: true` renders the confirm button in the error color.

Or via facade (exposed as `$confirm`):

```ts
const { $confirm } = useMapo();
const ok = await $confirm.ask({
  title: "Sure?",
  message: "Confirm this action?",
});
```

---

## `useSidebarStore`

Sidebar open/collapsed/clipped state. Persisted to cookies so it survives page reload and SSR hydration.

```ts
const sidebar = useSidebarStore();

sidebar.drawer; // boolean — open/closed
sidebar.mini; // boolean — icon-only mode
sidebar.clipped; // boolean — clipped to toolbar

sidebar.toggleDrawer();
sidebar.toggleMini();
sidebar.toggleClipped();
```

On SSR, `hydrateFromCookies()` is called automatically by the `@mapomodule/core` init plugin. Cookie names are defined in `SidebarCookieEnum`.

---

## `usePermissions()`

Composable for checking the current user's permissions in templates or scripts.

```ts
const { can, hasRole } = usePermissions();

can("change", "article"); // true if user has change_article permission
can("delete", "article");
hasRole("editor");
hasRole(["editor", "admin"]); // true if user has any of the roles
```

---

## Module internals

`@mapomodule/store/src/module.ts` is a Nuxt module that installs `@pinia/nuxt` in `setup()` to ensure Pinia is available before any store is used.

This means adding `@mapomodule/store` (or `@mapomodule/core` / `mapomodule`, which depend on it transitively) to `modules[]` is sufficient — you do not need to separately add `@pinia/nuxt`.

Nuxt 4.1+ introduces `moduleDependencies` (`version`, `defaults`, `overrides`) as the newer dependency declaration model. In this package, the resolver-based `installModule` path is still used for compatibility with the current monorepo/pnpm strict setup. See [Known Limitations](/guide/known-limitations).

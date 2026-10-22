# @mapomodule/store

The Pinia stores of Mapo (the session, the snackbar queue, the confirm dialog and the sidebar state) and the `usePermissions` selectors. The UIKit components and the core middleware read them, and so can your pages.

## Installation

Installed by the meta-package [`mapomodule`](https://www.npmjs.com/package/mapomodule), and by `@mapomodule/core` when the app does not register it. On its own:

```bash
pnpm add @mapomodule/store@next
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/store"],
});
```

The module has no options and installs `@pinia/nuxt` when the app does not register it. Mapo v2 is published on the `next` dist-tag while it is in beta.

## What you get

All of these are auto-imported.

| API                 | Purpose                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAuthStore()`    | The logged-in user (`info`), `isAuthenticated`, `role`, `permissions`, `modelPermissions`; `setUser` and `reset`                                           |
| `useSnackStore()`   | The snackbar queue: `show(message, type?, duration?)`, `dismiss(id?)`, `dismissAll()`                                                                      |
| `useConfirmStore()` | `ask(options)` opens the confirm dialog and resolves to `true` or `false`                                                                                  |
| `useSidebarStore()` | `drawer` and `mini` state, persisted in cookies; `toggleDrawer` and `toggleMini`                                                                           |
| `usePermissions()`  | `canView`, `canAdd`, `canChange`, `canDelete` for a Django model, `checkPermission(codename)` and `hasRole(group)`; superusers pass every permission check |

`MapoSnackBar` and `MapoConfirmDialog` from `@mapomodule/uikit` render the snack and confirm stores.

Code outside Nuxt's auto-imports, such as another module's runtime, imports a store by subpath (`@mapomodule/store/runtime/stores/auth`), never from the package root, which is the Nuxt module.

## Documentation

- [@mapomodule/store](https://lotrekagency.github.io/mapo-new/modules/store)
- [Feedback: toasts & dialogs](https://lotrekagency.github.io/mapo-new/howto/feedback)
- [Auth & permissions](https://lotrekagency.github.io/mapo-new/howto/auth-permissions)

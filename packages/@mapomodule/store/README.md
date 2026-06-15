# @mapomodule/store

Pinia stores for Mapo: auth, snackbar, confirm dialog, and sidebar. Plus the `usePermissions` composable. All stores are SSR-safe (`useCookie`, `useNuxtApp` under the hood).

## Installation

Typically installed via the meta-package [`mapomodule`](../../mapomodule/). Standalone:

```bash
pnpm add @mapomodule/store
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@mapomodule/store"],
});
```

The module installs `@pinia/nuxt` automatically if not already present.

## What you get (auto-imported)

| API                | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `useAuthStore`     | Authenticated user info, role, permissions, model permissions       |
| `useSnackStore`    | Snackbar message queue (`show`, `dismiss`, `dismissAll`)            |
| `useConfirmStore`  | Promise-based confirm dialog (`ask` returns `Promise<boolean>`)     |
| `useSidebarStore`  | Sidebar `drawer` / `mini` / `clipped` state with cookie persistence |
| `usePermissions()` | Selectors over the auth store: `canView`, `canAdd`, `hasRole`, etc. |

## Dev workflow

```bash
pnpm dev:store   # from monorepo root — watch mode
```

## Reference

See [docs/modules/store](../../../docs/modules/store.md) for the full API.

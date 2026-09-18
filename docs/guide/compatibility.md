# Compatibility & Troubleshooting

This page documents the exact package versions Mapo is tested against, which dependencies your app must (and must not) declare, and a catalogue of common runtime errors with their fixes.

---

## Tested versions

| Package       | Tested with                    | Notes                                                                                                                                                               |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nuxt`        | `^4.5.x`                       | Nuxt 4+ required. Nuxt 3 is not supported.                                                                                                                          |
| `@nuxt/ui`    | `^4.7.x`                       | v3.x is not supported. Declare in the app — not managed by mapomodule.                                                                                              |
| `vue`         | `^3.5.x`                       | Vue 3 required.                                                                                                                                                     |
| `vue-router`  | `^5.2.x`                       | Vue Router 5 required. Comes with Nuxt 4.                                                                                                                           |
| `pinia`       | `^3.0.4`                       | Managed internally by `@mapomodule/store`. Do **not** declare in your app.                                                                                          |
| `@pinia/nuxt` | `^0.11.3`                      | Managed internally by `@mapomodule/store`. Do **not** declare in your app.                                                                                          |
| `typescript`  | `^5.x` or `^6.x`               | Both work, but mixing versions across workspace packages causes a split-pinia bug. See [Troubleshooting](#getactivepinia-was-called-but-there-was-no-active-pinia). |
| Node.js       | `^22.19 \|\| ^24.11 \|\| >=26` | Node 24 is the developed-against baseline (`.nvmrc`).                                                                                                               |
| pnpm          | `>= 8`                         | Recommended. npm/yarn work but are untested in monorepo setups.                                                                                                     |

---

## What to declare in your app

```bash
pnpm add mapomodule @nuxt/ui
pnpm add @mapomodule/mapo-integrations-camomilla   # only if you use Camomilla CMS
```

`mapomodule` is a meta-package. It transparently installs `@mapomodule/core`, `@mapomodule/store`, `@mapomodule/uikit`, `@mapomodule/form`, `@mapomodule/i18n`, and `@mapomodule/utils`. You don't need to add them separately.

### What NOT to declare

| Package                | Why                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pinia/nuxt`          | `@mapomodule/store` installs it internally. A second declaration creates a duplicate pinia instance and triggers a `getActivePinia()` crash. |
| `pinia`                | Same reason — let the store package manage it.                                                                                               |
| `@mapomodule/core`     | Installed by `mapomodule`.                                                                                                                   |
| `@mapomodule/store`    | Installed by `mapomodule`.                                                                                                                   |
| `@mapomodule/uikit`    | Installed by `mapomodule`.                                                                                                                   |
| `@mapomodule/form`     | Installed by `mapomodule`.                                                                                                                   |
| `@iconify-json/lucide` | Bundled with `mapomodule`.                                                                                                                   |

---

## Module order in `nuxt.config.ts`

The order of entries in `modules[]` is significant:

```ts
export default defineNuxtConfig({
  modules: [
    "@nuxt/ui", // ← must come FIRST
    "mapomodule",
    "@mapomodule/mapo-integrations-camomilla", // optional
  ],
});
```

`@nuxt/ui` **must be declared before `mapomodule`**. If it comes after (or is installed programmatically via `installModule()` inside another module), Nuxt's `Icon.vue` component enters an infinite SSR recursion loop and the server crashes on the first page request.

---

## Vite deduplication

Add `pinia` to `vite.resolve.dedupe` in your `nuxt.config.ts`. This prevents Vite from bundling two copies of pinia when workspace dependencies have diverging peer resolution:

```ts
export default defineNuxtConfig({
  vite: {
    resolve: {
      dedupe: ["vue", "pinia"],
    },
  },
});
```

---

## Common problems

### `getActivePinia()` was called but there was no active Pinia

```
[🍍]: "getActivePinia()" was called but there was no active Pinia. Are you trying
to use a store before calling "app.use(pinia)"?
```

**Cause**: Two separate copies of `pinia.mjs` are loaded — `@pinia/nuxt` creates a Pinia instance with one copy, and `@mapomodule/store`'s stores call `getActivePinia()` from the other. The mismatch happens when:

- The app declares `@pinia/nuxt` as a direct dependency **and** the app uses a different TypeScript version than `@mapomodule/store`. pnpm generates a separate pinia variant per TypeScript peer (`pinia@3.0.4_typescript@6.0.3` vs `pinia@3.0.4_typescript@5.9.3`), so the two `@pinia/nuxt` instances pull in different pinia files.

**Fix**: Remove `@pinia/nuxt` from your app's `package.json`. `mapomodule` already installs it.

```diff
 dependencies:
   "@nuxt/ui": "^4.7.1",
-  "@pinia/nuxt": "^0.11.3",
   "mapomodule": "...",
```

After editing, run `pnpm install` and restart the dev server.

---

### `Icon.vue` infinite recursion / SSR crash on startup

```
Maximum call stack size exceeded
  at Icon.vue (...)
```

**Cause**: `@nuxt/ui` was declared **after** `mapomodule` in `modules[]`, or was installed via `installModule()` from inside a module. At SSR startup, `@nuxt/ui`'s Icon component enters an infinite self-referential render loop.

**Fix**: Move `@nuxt/ui` to the first position in `modules[]`. See [Module order](#module-order-in-nuxtconfigts).

---

### `Failed to fetch dynamically imported module: entry.js`

```
Uncaught (in promise) TypeError: Failed to fetch dynamically imported module:
http://localhost:3000/_nuxt/@fs/.../nuxt/dist/app/entry.js
```

**Cause**: Vite's module transform pipeline cached a broken module (e.g. from a syntax error that was since fixed). The dev server serves a corrupted entry bundle to the browser.

**Fix**: Stop the dev server completely and restart it. Hot-reload is not enough in this case.

---

### `useSnackStore` / `useConfirmStore` called outside setup

```
[Vue warn]: inject() can only be used inside setup() or functional components.
```

**Cause**: A store composable was called inside a plain function (not inside `<script setup>` or a `setup()` hook). This can happen when store calls are nested inside callbacks or event handlers that execute after component teardown.

**Fix**: Call the store at the top level of `<script setup>` and capture the reference:

```ts
// Correct — called at setup time
const snack = useSnackStore();
function save() {
  snack.show("Saved", "success");
}

// Wrong — called inside a callback, may fire outside component context
function save() {
  useSnackStore().show("Saved", "success");
}
```

---

### Subpath imports required in runtime code

```ts
// Wrong — pulls in @nuxt/kit, breaks in browser context
import { useAuthStore } from "@mapomodule/store";

// Correct
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
```

`@mapomodule/store`'s root entry is a Nuxt module file that imports `@nuxt/kit`. Importing the root in a Vue component or composable loads `@nuxt/kit` on the client and crashes.

In Vue components and pages you can use the auto-import provided by Nuxt (no explicit import needed). Only fall back to the subpath form when writing code outside a Vue component file (e.g. a plain `.ts` utility).

---

### TypeScript shows `any` for `@mapomodule/*` runtime imports

`nuxt-module-builder` generates empty `.d.ts` stubs for runtime subpath exports. This means TypeScript loses types for imports like `@mapomodule/store/runtime/stores/auth`.

**Fix (monorepo only)**: Add `paths` overrides in your `tsconfig.json` to point directly at the source:

```json
{
  "compilerOptions": {
    "paths": {
      "@mapomodule/store/runtime/stores/*": [
        "./node_modules/@mapomodule/store/src/runtime/stores/*.ts"
      ],
      "@mapomodule/store/runtime/*": [
        "./node_modules/@mapomodule/store/src/runtime/*.ts"
      ]
    }
  }
}
```

This only works when `@mapomodule/store` is installed as a local workspace package. For published packages, this limitation will be resolved by upstream `nuxt-module-builder` improvements.

---

### `cell.*` slot props typed as a union instead of the column's specific type

When using the `#cell.{key}` slot override in `<MapoList>` or `<MapoListTable>`, `value` and `item` may appear typed as a wide union or as `unknown` rather than the exact field type.

**Root cause — index signature vs mapped type**

The original `defineSlots` used a string-template index signature:

```ts
// Old — value is T[keyof T], a union of ALL property types
[K: `cell.${string}`]: (props: { item: T; value: T[keyof T] }) => any;
```

TypeScript cannot narrow `K` inside an index signature, so it cannot know which key of `T` is actually being used. If `T = { id: number; title: string; active: boolean }`, then `value` in every `#cell.*` slot was typed as `number | string | boolean`.

**The fix** — the slots are now defined as a mapped type:

```ts
// Current — value is T[K], narrowed per column
[K in keyof T as `cell.${K & string}`]: (props: {
  item: T;
  value: T[K];
}) => unknown;
```

With this form TypeScript creates one slot entry per key of `T`, so `#cell.title` gets `value: string`, `#cell.id` gets `value: number`, and so on.

**Remaining limitation — `T` must be a concrete type**

The mapped type only narrows correctly when `T` is a specific interface or type literal. If the component is used without a type parameter and `T` defaults to `Record<string, unknown>`, the mapped type degenerates back to an index signature and `value` is again `unknown`.

Always pass the row type explicitly:

```vue
<MapoList<Article> :endpoint="..." :columns="columns">
  <template #cell.title="{ item, value }">
    <!-- item: Article, value: string ✓ -->
    {{ value.toUpperCase() }}
  </template>
</MapoList>
```

**Remaining limitation — `vue-tsc` and intersected slot types**

`defineSlots` uses an intersection (`{ ...base slots... } & { ...cell slots... }`) to merge the named utility slots with the per-column cell slots. `vue-tsc` sometimes fails to resolve the intersection correctly and reports the cell slots as `unknown` even when `T` is concrete. This is a known `vue-tsc` limitation with generic slot intersections; the IDE (Volar/Vue Language Server) usually gets it right even when `vue-tsc` does not.

---

### `installModule` deprecation warning in console

```
[nuxt] [warn] installModule() is deprecated. ...
```

**Cause**: `mapomodule` uses `installModule()` with resolver-based paths to install `@mapomodule/*` sub-packages, so that consumer apps don't need to declare each package explicitly. This pattern triggers a Nuxt 4.1+ deprecation warning but is functionally correct.

This is a known limitation with no immediate fix — see [Known Limitations](./known-limitations#installmodule-deprecation-warning-active-in-selected-modules).

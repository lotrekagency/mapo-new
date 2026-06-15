# Import Guide

Mapo exposes APIs through two channels: **Nuxt auto-imports** (composables and stores) and **explicit package imports** (types and non-composable utilities). Knowing which channel to use saves time and avoids subtle errors.

---

## Composables — no import needed

Composables and stores are registered as Nuxt auto-imports by the `mapomodule` module. You can use them in any `.vue` file or `.ts` server/composable file without an explicit `import`:

```ts
// ✅ No import required — Nuxt auto-imports these
const auth = useMapoAuth();
const { list } = useCrud<Article>("/api/articles/");
const snack = useSnackStore();
const { fetch, loading } = useMapoFetch();
```

| Composable / Store                              | Auto-imported | Module              |
| ----------------------------------------------- | ------------- | ------------------- |
| `useCrud`                                       | ✅            | `@mapomodule/core`  |
| `useMapoAuth`                                   | ✅            | `@mapomodule/core`  |
| `useMapoFetch`                                  | ✅            | `@mapomodule/core`  |
| `useAuthStore`                                  | ✅            | `@mapomodule/store` |
| `useSnackStore`                                 | ✅            | `@mapomodule/store` |
| `useConfirmStore`                               | ✅            | `@mapomodule/store` |
| `useSidebarStore`                               | ✅            | `@mapomodule/store` |
| `usePermissions`                                | ✅            | `@mapomodule/store` |
| `useMapoForm`                                   | ✅            | `@mapomodule/form`  |
| `useFormFromSchema`                             | ✅            | `@mapomodule/form`  |
| `useFormDraft`                                  | ✅            | `@mapomodule/form`  |
| `useUnsavedChangesGuard`                        | ✅            | `@mapomodule/form`  |
| `useFocusMode`                                  | ✅            | `@mapomodule/form`  |
| `defineFormField`                               | ✅            | `@mapomodule/form`  |
| `when` / `whenAny` / `whenNot` / `matchesField` | ✅            | `@mapomodule/form`  |

> Only `@mapomodule/utils` functions (`debounce`, `deepMerge`, `objectDiff`, `formatDate`, etc.) are **not** auto-imported and require an explicit import.

---

## Types — `mapomodule/types` vs package-specific

Types are never auto-imported — they are always imported explicitly with `import type`. The recommendation is to use the `mapomodule/types` aggregator for the common cases and fall back to package-specific paths only when necessary.

### Recommended: `mapomodule/types`

```ts
import type {
  FieldDescriptor,
  ListColumn,
  CrudRepository,
  MapoUser,
  SnackType,
  FieldRegistry,
} from "mapomodule/types";
```

### Fallback: package-specific paths

Use a package-specific path when:

- The type is not re-exported by `mapomodule/types`
- You want explicit coupling to a module for semver reasons
- You are building a plugin/package that depends on a single module

::: warning Declare the package
With pnpm's strict dependency layout, a package-specific import (e.g. `@mapomodule/form/types`) resolves **only if that package is declared in your app's `dependencies`** — installing `mapomodule` alone is not enough for direct imports. The `mapomodule/types` aggregator never has this problem. See [Known limitations](./known-limitations#direct-type-imports-require-declaring-the-package-pnpm-strict-mode).
:::

```ts
import type { FieldDescriptor } from "@mapomodule/form/types";
import type { ListColumn } from "@mapomodule/uikit/types";
import type { CrudRepository } from "@mapomodule/core/types";
```

### Camomilla types — always package-specific

Camomilla is an optional integration and is never part of `mapomodule/types`:

```ts
import type { CamomillaPathRewrite } from "mapo-integrations-camomilla/types";
```

---

## Full API → import table

| API                                             | Kind        | Recommended import                                             | Notes                        |
| ----------------------------------------------- | ----------- | -------------------------------------------------------------- | ---------------------------- |
| `useCrud`                                       | composable  | auto-imported                                                  | —                            |
| `useMapoAuth`                                   | composable  | auto-imported                                                  | —                            |
| `useMapoFetch`                                  | composable  | auto-imported                                                  | returns `{ fetch, loading }` |
| `useAuthStore`                                  | store       | auto-imported                                                  | —                            |
| `useSnackStore`                                 | store       | auto-imported                                                  | —                            |
| `useConfirmStore`                               | store       | auto-imported                                                  | —                            |
| `useSidebarStore`                               | store       | auto-imported                                                  | —                            |
| `usePermissions`                                | composable  | auto-imported                                                  | —                            |
| `useMapoForm`                                   | composable  | auto-imported                                                  | —                            |
| `useFormFromSchema`                             | composable  | auto-imported                                                  | —                            |
| `useFormDraft`                                  | composable  | auto-imported                                                  | —                            |
| `useUnsavedChangesGuard`                        | composable  | auto-imported                                                  | —                            |
| `useFocusMode`                                  | composable  | auto-imported                                                  | —                            |
| `defineFormField`                               | function    | auto-imported                                                  | call from a Nuxt plugin      |
| `when` / `whenAny` / `whenNot` / `matchesField` | helpers     | auto-imported                                                  | progressive disclosure       |
| `isOneOf` / `isNoneOf` / `isEmpty` / …          | matchers    | auto-imported                                                  | use with `matchesField`      |
| `debounce`                                      | utility     | `import { debounce } from '@mapomodule/utils'`                 | not a composable             |
| `deepMerge`                                     | utility     | `import { deepMerge } from '@mapomodule/utils'`                | —                            |
| `objectDiff`                                    | utility     | `import { objectDiff } from '@mapomodule/utils'`               | —                            |
| `deepClone`                                     | utility     | `import { deepClone } from '@mapomodule/utils'`                | —                            |
| `formatDate`                                    | utility     | `import { formatDate } from '@mapomodule/utils'`               | —                            |
| `normalizeEndpoint`                             | utility     | `import { normalizeEndpoint } from '@mapomodule/utils'`        | —                            |
| `getNestedValue`                                | utility     | `import { getNestedValue } from '@mapomodule/utils'`           | —                            |
| `setNestedValue`                                | utility     | `import { setNestedValue } from '@mapomodule/utils'`           | —                            |
| `setNestedValueMutating`                        | utility     | `import { setNestedValueMutating } from '@mapomodule/utils'`   | —                            |
| `buildRouteTree`                                | utility     | `import { buildRouteTree } from '@mapomodule/utils'`           | —                            |
| `resolveSchema`                                 | json-schema | `import { resolveSchema } from '@mapomodule/utils/jsonSchema'` | —                            |
| `extractDefs`                                   | json-schema | `import { extractDefs } from '@mapomodule/utils/jsonSchema'`   | —                            |
| `FieldDescriptor<T>`                            | type        | `import type { FieldDescriptor } from 'mapomodule/types'`      | strict built-in union        |
| `AnyFieldDescriptor<T>`                         | type        | `import type { AnyFieldDescriptor } from 'mapomodule/types'`   | includes custom field types  |
| `FieldRegistry`                                 | type        | `import type { FieldRegistry } from 'mapomodule/types'`        | —                            |
| `ListColumn<T>`                                 | type        | `import type { ListColumn } from 'mapomodule/types'`           | generic preserved            |
| `CrudRepository<T>`                             | type        | `import type { CrudRepository } from 'mapomodule/types'`       | —                            |
| `MapoUser`                                      | type        | `import type { MapoUser } from 'mapomodule/types'`             | —                            |
| `SnackType`                                     | type        | `import type { SnackType } from 'mapomodule/types'`            | —                            |
| `CamomillaPathRewrite`                          | type        | `import type { ... } from 'mapo-integrations-camomilla/types'` | optional package             |

---

## Utils — explicit import examples

```ts
import {
  debounce,
  deepMerge,
  objectDiff,
  deepClone,
  formatDate,
  normalizeEndpoint,
  getNestedValue,
  setNestedValue,
  setNestedValueMutating,
  buildRouteTree,
  isFile,
  isBlob,
  isFileOrBlob,
  findPropPaths,
  filesInObject,
  filterObj,
  slotNamespace,
} from "@mapomodule/utils";
```

JSON Schema helpers live in a subpath:

```ts
import {
  resolveSchema,
  extractDefs,
  getDefaultForSchema,
  matchesSchema,
  applyConditionals,
  hasConditionals,
} from "@mapomodule/utils/jsonSchema";
```

---

## Summary rules

1. **Composables and stores** → no import, Nuxt handles it.
2. **Types** → `import type { ... } from 'mapomodule/types'` for the common case; package-specific when the type isn't re-exported or when building a standalone plugin.
3. **Utils** → always explicit: `import { fn } from '@mapomodule/utils'`.
4. **Camomilla types** → always `mapo-integrations-camomilla/types`.

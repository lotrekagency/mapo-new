# Adding a composable, store or utility

How to add an auto-imported composable or Pinia store to a Mapo package, or a helper to `@mapomodule/utils`. Read it before adding anything to a package's public surface.

## Pick the package

| What it does                                  | Package             |
| --------------------------------------------- | ------------------- |
| HTTP, CRUD, auth, route guards                | `@mapomodule/core`  |
| Shared state that survives navigation (Pinia) | `@mapomodule/store` |
| Shell, list, detail, media or menu behaviour  | `@mapomodule/uikit` |
| Form state, descriptors, field behaviour      | `@mapomodule/form`  |
| Translation helpers                           | `@mapomodule/i18n`  |
| Pure functions with no Nuxt or Vue dependency | `@mapomodule/utils` |

## A composable or a store

### 1. The file

Put it under the package's `src/runtime/`: `composables/use<Name>.ts`, or `stores/<name>.ts` for a store. Give the exported function a JSDoc comment: what it does, its parameters, what it returns.

### 2. Imports in runtime code

Runtime code never imports a package's root entry: the root is the Nuxt module and pulls `@nuxt/kit` into the browser. Use subpath imports:

```ts
// Correct
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";

// Wrong: loads the Nuxt module in the client
import { useAuthStore } from "@mapomodule/store";
```

The reason and the typing workaround are in [Known limitations](/guide/known-limitations#subpath-imports-required-in-runtime-code).

### 3. Auto-import

Register it in the package's `src/module.ts`:

```ts
addImports([
  {
    name: "useMyThing",
    from: resolver.resolve("./runtime/composables/useMyThing"),
  },
]);
```

The MCP server reads these `addImports([...])` calls at build time, so `mapo_composable_api` lists the new composable with its real signature. A composable that is not registered there is invisible to it.

### 4. Types

Export the public types from the package's `src/index.ts`. They then resolve from `@mapomodule/<package>/types` and from the `mapomodule/types` aggregator.

### 5. Tests

Test the composable with Vitest. Nuxt auto-imports are not available in unit tests: the root config aliases `#imports` to a mock, and anything else is imported explicitly. See [Testing](./testing#unit-tests).

### 6. Docs

- An entry in `docs/modules/api.md`, in the format of [Writing documentation](./documentation#documenting-a-composable-or-a-function).
- A section on the narrative page of the package (`docs/modules/core.md`, `store.md`, …).
- A recipe in `packages/@mapomodule/mcp/src/runtime/core/recipes.ts` if it enables a new task.

## A utility in `@mapomodule/utils`

`@mapomodule/utils` is plain TypeScript built with `tsc`: no Nuxt, no Vue, no auto-import. Apps and packages import from it explicitly.

1. Add `src/<name>.ts` and export it from `src/index.ts`.
2. Add `src/__tests__/<name>.test.ts`. Every utility has tests, edge cases included.
3. Document it in `docs/modules/utils.md` and `docs/modules/api.md`.

## Checklist

- [ ] The right package, a JSDoc comment, subpath imports in runtime code.
- [ ] Registered with `addImports` (composables and stores) or exported from `index.ts` (utilities).
- [ ] Types exported; tests written.
- [ ] `docs/modules/api.md` and the narrative page updated; a recipe if a new task is possible.

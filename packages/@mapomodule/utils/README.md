# @mapomodule/utils

Plain TypeScript helpers shared by the `@mapomodule/*` packages: object and path utilities, formatting, endpoint normalization, menu trees, JSON Schema conditionals, and the readers of DRF metadata and OpenAPI documents. No Vue, no Nuxt, no side effects, so they are safe in server code and tests.

It is not a Nuxt module and nothing is auto-imported: import what you need.

```ts
import { debounce, deepMerge, slugify } from "@mapomodule/utils";
import { applyConditionals } from "@mapomodule/utils/jsonSchema";
```

## Installation

```bash
pnpm add @mapomodule/utils@next
```

Apps already get it through `mapomodule`, but with pnpm's strict layout an app can import it only if the package is declared in its own `dependencies`. Mapo v2 is published on the `next` dist-tag while it is in beta.

## What's inside

| Area                                                                      | Exports                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Objects                                                                   | `deepMerge`, `deepClone`, `objectDiff`, `filterObj`, `findPropPaths`                                                                  |
| Nested paths                                                              | `getNestedValue`, `setNestedValue`, `setNestedValueMutating`                                                                          |
| Files                                                                     | `isFile`, `isBlob`, `isFileOrBlob`, `filesInObject`                                                                                   |
| Formatting                                                                | `formatDate`, `humanFileSize`, `slugify`                                                                                              |
| Timing                                                                    | `debounce`                                                                                                                            |
| Endpoints                                                                 | `normalizeEndpoint`, `splitEndpointParams`                                                                                            |
| Slots and menus                                                           | `slotNamespace`, `buildRouteTree`, `calcMaxMenuNestDepth`, the `MenuNode` type                                                        |
| JSON Schema (`@mapomodule/utils/jsonSchema`, also exported from the root) | `matchesSchema`, `applyConditionals`, `hasConditionals`, `resolveSchema`, `extractDefs`, `getDefaultForSchema`, the `JSONSchema` type |
| Backend schemas (same entries)                                            | `metadataToJsonSchema`, `drfMetadataToJsonSchema`, `openApiToJsonSchema`, `openApiModels`; `FIELD_KEYWORD`, `ATTRS_KEYWORD`           |

## Documentation

- [@mapomodule/utils](https://lotrekagency.github.io/mapo-new/modules/utils): every helper with examples
- [Composable & Function API Reference](https://lotrekagency.github.io/mapo-new/modules/api): signatures, including the JSON Schema helpers
- [Import Guide](https://lotrekagency.github.io/mapo-new/guide/imports)

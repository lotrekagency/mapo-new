# @mapomodule/utils

Pure TypeScript utility helpers shared across all `@mapomodule/*` packages. No Vue, no Nuxt, no side effects — safe to import from any context including server-only code and tests.

## Installation

```bash
pnpm add @mapomodule/utils
```

---

## `normalizeEndpoint(endpoint)`

Ensures an API endpoint path has exactly one leading slash and one trailing slash. Query strings (anything after `?`) are preserved unchanged — the slash is inserted before the `?`, never after it. Used internally by `useCrud` to normalize user-provided paths.

```ts
import { normalizeEndpoint } from "@mapomodule/utils";

normalizeEndpoint("api/articles"); // '/api/articles/'
normalizeEndpoint("/api/articles"); // '/api/articles/'
normalizeEndpoint("/api/articles/"); // '/api/articles/'
normalizeEndpoint("///api/articles"); // '/api/articles/'
normalizeEndpoint("/api/articles?fields=id"); // '/api/articles/?fields=id'
normalizeEndpoint("/api/articles/?ordering=-date"); // '/api/articles/?ordering=-date'
```

---

## `splitEndpointParams(endpoint)`

Splits an endpoint string into its clean `path` and the parsed query `params`. Useful when an endpoint carries baked-in params (e.g. `?fields=id,title`) that must be merged into request params while CRUD mutations target the bare path. Used by `MapoListTable` to keep the list endpoint and mutation endpoints in sync.

```ts
import { splitEndpointParams } from "@mapomodule/utils";

splitEndpointParams("/api/articles/?fields=id,title");
// → { path: '/api/articles/', params: { fields: 'id,title' } }

splitEndpointParams("/api/articles/");
// → { path: '/api/articles/', params: {} }
```

---

## `deepMerge(target, source)`

Recursively merges two plain objects. Arrays and primitives in `source` overwrite those in `target`; nested objects are merged recursively.

```ts
import { deepMerge } from "@mapomodule/utils";

deepMerge({ a: 1, b: { c: 2 } }, { b: { d: 3 } });
// → { a: 1, b: { c: 2, d: 3 } }
```

---

## `getNestedValue(obj, path)` / `setNestedValue(obj, path, value)`

Read or write a value at a dotted path string.

```ts
import { getNestedValue, setNestedValue } from "@mapomodule/utils";

const obj = { user: { address: { city: "Rome" } } };

getNestedValue(obj, "user.address.city"); // 'Rome'
setNestedValue(obj, "user.address.city", "Milan");
// → { user: { address: { city: 'Milan' } } }
```

---

## `objectDiff(original, updated)`

Returns only the keys whose values differ between two objects. Used by `useCrud.partialUpdate` to send minimal PATCH payloads.

```ts
import { objectDiff } from "@mapomodule/utils";

objectDiff({ title: "Old", body: "Text" }, { title: "New", body: "Text" });
// → { title: 'New' }
```

Arrays are compared **by content** (deep recursive equality), not by reference. This means a cloned array with identical elements is treated as unchanged — which prevents false-positive `isDirty` flags when the form baseline is built from `deepClone(model)`.

---

## `formatDate(date, format?)`

Formats a `Date` object or ISO string using a token-based format string.

| Token  | Value               |
| ------ | ------------------- |
| `YYYY` | 4-digit year        |
| `MM`   | 2-digit month       |
| `DD`   | 2-digit day         |
| `HH`   | 2-digit hours (24h) |
| `mm`   | 2-digit minutes     |
| `ss`   | 2-digit seconds     |

```ts
import { formatDate } from "@mapomodule/utils";

formatDate(new Date("2026-04-28T10:30:00"), "YYYY-MM-DD"); // '2026-04-28'
formatDate("2026-04-28T10:30:00", "DD/MM/YYYY HH:mm"); // '28/04/2026 10:30'
```

---

## `debounce(fn, delay)`

Returns a debounced version of `fn` that delays invocation until `delay` ms have elapsed since the last call.

```ts
import { debounce } from "@mapomodule/utils";

const onSearch = debounce((query: string) => fetchResults(query), 300);
```

---

## `slotNamespace(slots, prefix)`

Filters a Vue `Slots` object to only those whose names start with `prefix`, and strips the prefix from each key. Used to forward a slot subset to a child component.

```ts
import { slotNamespace } from "@mapomodule/utils";

// Parent has slots: 'header', 'list:empty', 'list:item'
const listSlots = slotNamespace(slots, "list:");
// → { empty: ..., item: ... }
```

---

## `buildRouteTree(routes)`

Converts a flat `RouteRecordNormalized[]` array into a nested `MenuNode[]` tree, using `route.meta.parent` to establish parent–child relationships. Used by the sidebar to build the navigation tree.

```ts
import { buildRouteTree } from "@mapomodule/utils";
import type { MenuNode } from "@mapomodule/utils";

const tree: MenuNode[] = buildRouteTree(router.getRoutes());
```

---

## `calcMaxMenuNestDepth(nodes)`

Returns the maximum nesting depth of a `MenuNode[]` tree. Root level = 1.

```ts
import { calcMaxMenuNestDepth } from "@mapomodule/utils";

calcMaxMenuNestDepth([]); // 0
calcMaxMenuNestDepth([{ children: [] }]); // 1
calcMaxMenuNestDepth([{ children: [{ children: [] }] }]); // 2
```

---

## `deepClone(value)`

Deep-clones plain objects and arrays. Does not handle class instances, Maps, Sets, or circular references.

```ts
import { deepClone } from "@mapomodule/utils";

const copy = deepClone({ user: { name: "Alice", tags: ["admin"] } });
copy.user.tags.push("editor");
// original is unchanged
```

---

## `isFile(value)` / `isBlob(value)` / `isFileOrBlob(value)`

Type-safe guards for `File` and `Blob` instances. Safe to call server-side (returns `false` if the global is unavailable).

```ts
import { isFile, isBlob, isFileOrBlob } from "@mapomodule/utils";

isFile(new File([], "doc.pdf")); // true
isBlob(new Blob(["data"])); // true
isFileOrBlob(42); // false
```

---

## `findPropPaths(obj, predicate)`

Returns all dot-notation paths in `obj` where `predicate(value)` is truthy.

```ts
import { findPropPaths, isFile } from "@mapomodule/utils";

const obj = { title: "Hello", meta: { thumb: new File([], "img.png") } };
findPropPaths(obj, isFile); // ["meta.thumb"]
```

---

## `filesInObject(obj)`

Shorthand for `findPropPaths(obj, isFileOrBlob)`. Returns paths of all `File` / `Blob` values — used internally by `useCrud` multipart detection.

```ts
import { filesInObject } from "@mapomodule/utils";

filesInObject({ title: "Doc", file: new File([], "a.pdf") }); // ["file"]
```

---

## `filterObj(obj, keys)`

Returns a shallow copy of `obj` containing only the specified top-level keys.

```ts
import { filterObj } from "@mapomodule/utils";

filterObj({ a: 1, b: 2, c: 3 }, ["a", "c"]); // { a: 1, c: 3 }
```

# Modules — Composable & Function API Reference

Input parameters, return types, and descriptions for all exported composables and utility functions.

---

## Core — `@mapomodule/core`

### `useCrud<T>(endpoint: string)`

Generic CRUD composable backed by `$mapoFetch`.

| Parameter  | Type     | Description                                   |
| ---------- | -------- | --------------------------------------------- |
| `endpoint` | `string` | Base REST endpoint (e.g. `'/api/articles/'`). |

**Returns** an object with:

| Member           | Signature                                             | Description                                                                 |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `list`           | `(params?, config?) => Promise<PaginatedResponse<T>>` | Fetch a paginated list. Query params are forwarded to the server.           |
| `detail`         | `(id, config?) => Promise<T>`                         | Fetch a single record by ID.                                                |
| `create`         | `(data, config?, opts?) => Promise<T>`                | POST a new record. Applies multipart policy automatically when files exist. |
| `update`         | `(id, data, config?, opts?) => Promise<T>`            | PUT a full record.                                                          |
| `partialUpdate`  | `(id, diff, config?, opts?) => Promise<T>`            | PATCH a partial record.                                                     |
| `delete`         | `(id, config?) => Promise<void>`                      | DELETE a record.                                                            |
| `updateOrCreate` | `(data, config?, opts?) => Promise<T>`                | PUT if `data.id` is present, otherwise POST.                                |
| `updateOrder`    | `(startId, endId, config?) => Promise<void>`          | POST to `{endpoint}update_order/` — used for drag-and-drop reorder.         |

---

### `useMapoAuth()`

Authentication composable. Wraps login, logout, and user-fetching over `$mapoFetch`.

**Parameters:** none.

**Returns:**

| Member      | Signature                                                | Description                                                                                     |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `login`     | `(credentials: { username, password }) => Promise<void>` | POST credentials; confirms the session by calling `fetchUser`.                                  |
| `logout`    | `() => Promise<void>`                                    | GET logout endpoint, clears the session cookie, resets `useAuthStore`, redirects to `loginUrl`. |
| `fetchUser` | `() => Promise<void>`                                    | GET current user info and hydrate `useAuthStore`.                                               |

---

## Store — `@mapomodule/store`

### `useAuthStore()`

Pinia store for the authenticated user's session.

**State:**

| Field              | Type                               | Description                                                                     |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------- |
| `info`             | `MapoUser \| null`                 | Full user object returned by the backend.                                       |
| `rawPermissions`   | `string[]`                         | Flat array of permission codenames.                                             |
| `modelPermissions` | `Record<string, ModelPermissions>` | Per-model CRUD permission map.                                                  |
| `pagePermissions`  | `Record<string, string[]>`         | Page-level permission map (populated when `meta.permissions` uses `{ model }`). |

**Getters:**

| Getter            | Type             | Description                        |
| ----------------- | ---------------- | ---------------------------------- |
| `isAuthenticated` | `boolean`        | `true` when `info` is non-null.    |
| `isLoggedIn`      | `boolean`        | Alias for `isAuthenticated`.       |
| `role`            | `string \| null` | User's primary role string.        |
| `username`        | `string \| null` | User's username.                   |
| `permissions`     | `string[]`       | Flat list of permission codenames. |

**Actions:**

| Action    | Signature                  | Description                                                |
| --------- | -------------------------- | ---------------------------------------------------------- |
| `setUser` | `(user: MapoUser) => void` | Set user data and parse permissions into all derived maps. |
| `reset`   | `() => void`               | Clear all auth state (called on logout).                   |

---

### `useSnackStore()`

Pinia store for toast notifications. Used by `MapoSnackBar`.

**State:**

| Field      | Type             | Description                           |
| ---------- | ---------------- | ------------------------------------- |
| `messages` | `SnackMessage[]` | Queue of pending snack notifications. |

**Getters:**

| Getter    | Type                   | Description                                |
| --------- | ---------------------- | ------------------------------------------ |
| `current` | `SnackMessage \| null` | Last notification in the queue, or `null`. |

**Actions:**

| Action       | Signature                                                        | Description                                                        |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `show`       | `(message: string, type?: SnackType, duration?: number) => void` | Push a snack notification. `type` defaults to `'info'`.            |
| `dismiss`    | `(id?: number) => void`                                          | Remove notification by ID, or pop the last one if `id` is omitted. |
| `dismissAll` | `() => void`                                                     | Clear all pending notifications at once.                           |

```ts
type SnackType = "success" | "error" | "warning" | "info";
```

---

### `useConfirmStore()`

Pinia store for the confirmation dialog. Used by `MapoConfirmDialog`.

**State:**

| Field     | Type                          | Description                    |
| --------- | ----------------------------- | ------------------------------ |
| `active`  | `Ref<boolean>`                | Whether the dialog is visible. |
| `options` | `Ref<ConfirmOptions \| null>` | Current dialog options.        |

**Methods:**

| Method    | Signature                                    | Description                                                            |
| --------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `ask`     | `(opts: ConfirmOptions) => Promise<boolean>` | Show a dialog and await the user's answer. Resolves `true` on confirm. |
| `confirm` | `() => void`                                 | Resolve the pending promise as `true`.                                 |
| `cancel`  | `() => void`                                 | Resolve the pending promise as `false`.                                |

---

### `useSidebarStore()`

Pinia store for sidebar display state, persisted in cookies.

**State:**

| Field    | Type      | Description                    |
| -------- | --------- | ------------------------------ |
| `drawer` | `boolean` | Mobile drawer visibility.      |
| `mini`   | `boolean` | Mini (icon-only) sidebar mode. |

**Actions:**

| Action               | Signature    | Description                                        |
| -------------------- | ------------ | -------------------------------------------------- |
| `toggleDrawer`       | `() => void` | Toggle `drawer` and persist to cookie.             |
| `toggleMini`         | `() => void` | Toggle `mini` and persist to cookie.               |
| `hydrateFromCookies` | `() => void` | Restore state from cookies (called by SSR plugin). |

---

### `usePermissions()`

Convenience composable with readable permission-check methods.

**Parameters:** none.

**Returns:**

| Method            | Signature                       | Description                                   |
| ----------------- | ------------------------------- | --------------------------------------------- |
| `canView`         | `(model: string) => boolean`    | Check `view_<model>` permission.              |
| `canAdd`          | `(model: string) => boolean`    | Check `add_<model>` permission.               |
| `canChange`       | `(model: string) => boolean`    | Check `change_<model>` permission.            |
| `canDelete`       | `(model: string) => boolean`    | Check `delete_<model>` permission.            |
| `checkPermission` | `(codename: string) => boolean` | Check an arbitrary permission codename.       |
| `hasRole`         | `(role: string) => boolean`     | Check if the user has a specific role string. |

---

## Utils — `@mapomodule/utils`

### `debounce(fn, ms)`

| Parameter | Type                                        | Description            |
| --------- | ------------------------------------------- | ---------------------- |
| `fn`      | `T extends (...args: unknown[]) => unknown` | Function to debounce.  |
| `ms`      | `number`                                    | Delay in milliseconds. |

**Returns:** `(...args: Parameters<T>) => void` — A new function that resets the timer on each call and executes `fn` only after `ms` ms of silence.

---

### `deepMerge(base, override)`

| Parameter  | Type                                | Description         |
| ---------- | ----------------------------------- | ------------------- |
| `base`     | `T extends Record<string, unknown>` | Base object.        |
| `override` | `Partial<T>`                        | Values to merge in. |

**Returns:** `T` — A new object with `override` recursively merged into `base`. Arrays are replaced, not merged.

---

### `objectDiff(base, current)`

| Parameter | Type                                | Description        |
| --------- | ----------------------------------- | ------------------ |
| `base`    | `T extends Record<string, unknown>` | Original snapshot. |
| `current` | `T`                                 | Current state.     |

**Returns:** `Partial<T>` — Only the properties that differ between `base` and `current`, recursively.

---

### `deepClone(value)`

| Parameter | Type | Description         |
| --------- | ---- | ------------------- |
| `value`   | `T`  | Any value to clone. |

**Returns:** `T` — A deep clone using structured cloning. Does not handle class instances, Maps, Sets, or circular references.

---

### `formatDate(date, format?)`

| Parameter | Type             | Default        | Description                                                  |
| --------- | ---------------- | -------------- | ------------------------------------------------------------ |
| `date`    | `string \| Date` | —              | Date to format.                                              |
| `format`  | `string`         | `'YYYY-MM-DD'` | Format string. Tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`. |

**Returns:** `string` — Formatted date string.

---

### `normalizeEndpoint(endpoint)`

| Parameter  | Type     | Description |
| ---------- | -------- | ----------- |
| `endpoint` | `string` | API path.   |

**Returns:** `string` — Endpoint with exactly one leading and one trailing slash (e.g. `/api/articles/`).

---

### `getNestedValue(obj, path)`

| Parameter | Type      | Description                                     |
| --------- | --------- | ----------------------------------------------- |
| `obj`     | `unknown` | Object to read from.                            |
| `path`    | `string`  | Dot-notation path (e.g. `'user.profile.name'`). |

**Returns:** `unknown` — Value at the path, or `undefined` if any segment is missing.

---

### `setNestedValue(obj, path, value)`

| Parameter | Type                                | Description          |
| --------- | ----------------------------------- | -------------------- |
| `obj`     | `T extends Record<string, unknown>` | Object to copy from. |
| `path`    | `string`                            | Dot-notation path.   |
| `value`   | `unknown`                           | Value to set.        |

**Returns:** `T` — New object with the value set at the given path (immutable).

---

### `setNestedValueMutating(obj, path, value)`

| Parameter | Type                      | Description                |
| --------- | ------------------------- | -------------------------- |
| `obj`     | `Record<string, unknown>` | Object to mutate directly. |
| `path`    | `string`                  | Dot-notation path.         |
| `value`   | `unknown`                 | Value to set.              |

**Returns:** `void` — Mutates `obj` in-place, creating intermediate objects as needed. Prefer this for Vue reactive proxies.

---

### `isFile(value)` / `isBlob(value)` / `isFileOrBlob(value)`

Type guards.

| Function                       | Returns                 | Description                  |
| ------------------------------ | ----------------------- | ---------------------------- |
| `isFile(value: unknown)`       | `value is File`         | `true` if value is a `File`. |
| `isBlob(value: unknown)`       | `value is Blob`         | `true` if value is a `Blob`. |
| `isFileOrBlob(value: unknown)` | `value is File \| Blob` | `true` if value is either.   |

---

### `findPropPaths(obj, predicate, _prefix?)`

| Parameter   | Type                        | Description                                  |
| ----------- | --------------------------- | -------------------------------------------- |
| `obj`       | `unknown`                   | Object to search recursively.                |
| `predicate` | `(val: unknown) => boolean` | Test function.                               |
| `_prefix`   | `string`                    | Internal: dot-notation prefix for recursion. |

**Returns:** `string[]` — All dot-notation paths where `predicate(value)` returns `true`.

---

### `filesInObject(obj)`

| Parameter | Type      | Description       |
| --------- | --------- | ----------------- |
| `obj`     | `unknown` | Object to search. |

**Returns:** `string[]` — Dot-notation paths of all `File` or `Blob` values found anywhere in the object tree.

---

### `filterObj(obj, keys)`

| Parameter | Type                                | Description    |
| --------- | ----------------------------------- | -------------- |
| `obj`     | `T extends Record<string, unknown>` | Source object. |
| `keys`    | `(keyof T)[]`                       | Keys to keep.  |

**Returns:** `Partial<T>` — Shallow copy containing only the listed keys.

---

### `slotNamespace(slots, prefix)`

| Parameter | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `slots`   | `Slots`  | Vue slots object.                               |
| `prefix`  | `string` | Prefix to filter and strip (e.g. `'sidebar:'`). |

**Returns:** `Slots` — New slots object containing only slots whose name starts with `prefix`, with the prefix removed.

---

### `buildRouteTree(routes)`

| Parameter | Type                      | Description                          |
| --------- | ------------------------- | ------------------------------------ |
| `routes`  | `RouteRecordNormalized[]` | Vue Router normalized route records. |

**Returns:** `MenuNode[]` — Tree of navigation nodes built from route `meta` fields (`label`, `icon`, `parent`, `hidden`, `sidebarFooter`).

---

### `calcMaxMenuNestDepth(nodes, depth?)`

| Parameter | Type         | Default | Description                      |
| --------- | ------------ | ------- | -------------------------------- |
| `nodes`   | `MenuNode[]` | —       | Array of menu nodes to traverse. |
| `depth`   | `number`     | `1`     | Starting depth.                  |

**Returns:** `number` — Maximum nesting depth in the tree (root level = 1).

---

## JSON Schema Helpers — `@mapomodule/utils/jsonSchema`

### `resolveSchema(schema, defs, seen?, depth?)`

| Parameter | Type                         | Default         | Description                                         |
| --------- | ---------------------------- | --------------- | --------------------------------------------------- |
| `schema`  | `JSONSchema`                 | —               | Schema node to resolve.                             |
| `defs`    | `Record<string, JSONSchema>` | —               | Flat map of named definitions from the root schema. |
| `seen`    | `WeakSet<JSONSchema>`        | `new WeakSet()` | Cycle detection set.                                |
| `depth`   | `number`                     | `0`             | Recursion depth, capped at 32.                      |

**Returns:** `JSONSchema` — Fully resolved schema with all `$ref`, `anyOf`, and `oneOf` pointers expanded and nullable patterns unwrapped.

---

### `extractDefs(schema)`

| Parameter | Type         | Description           |
| --------- | ------------ | --------------------- |
| `schema`  | `JSONSchema` | Root schema document. |

**Returns:** `Record<string, JSONSchema>` — All named sub-schemas from `$defs` or `definitions`.

---

### `getDefaultForSchema(schema)`

| Parameter | Type         | Description           |
| --------- | ------------ | --------------------- |
| `schema`  | `JSONSchema` | Resolved schema node. |

**Returns:** `unknown` — A sensible default value inferred from the schema type (`{}`, `[]`, `''`, `0`, `false`, `null`).

---

### `matchesSchema(value, schema)`

| Parameter | Type         | Description                 |
| --------- | ------------ | --------------------------- |
| `value`   | `unknown`    | Data value to test.         |
| `schema`  | `JSONSchema` | Schema to validate against. |

**Returns:** `boolean` — `true` if the value satisfies all schema constraints.

---

### `applyConditionals(schema, value, resolver?)`

| Parameter  | Type                            | Description                                                |
| ---------- | ------------------------------- | ---------------------------------------------------------- |
| `schema`   | `JSONSchema`                    | Base schema with conditional keywords.                     |
| `value`    | `unknown`                       | Current form data used to evaluate `if` / `then` / `else`. |
| `resolver` | `(s: JSONSchema) => JSONSchema` | Optional `$ref` resolver for conditional branches.         |

**Returns:** `JSONSchema` — Merged schema after applying all matching `if/then/else`, `dependentSchemas`, and `dependentRequired` branches. Iterates up to 8 times for cascading rules.

---

### `hasConditionals(schema)`

| Parameter | Type         | Description        |
| --------- | ------------ | ------------------ |
| `schema`  | `JSONSchema` | Schema to inspect. |

**Returns:** `boolean` — `true` if the schema contains any conditional keywords (`if`, `dependentSchemas`, `dependentRequired`).

---

## Form — `@mapomodule/form`

### `useMapoForm(options)`

Core composable powering `MapoForm`. Provides dirty tracking, validation, and submit flows.

| Option        | Type                             | Default        | Description                             |
| ------------- | -------------------------------- | -------------- | --------------------------------------- |
| `model`       | `Ref<T>`                         | — **required** | Reactive form model.                    |
| `fields`      | `MaybeRef<FieldDescriptor<T>[]>` | — **required** | Field descriptors (static or reactive). |
| `errors`      | `Ref<Record<string, string[]>>`  | `{}`           | Server-side validation errors.          |
| `languages`   | `string[]`                       | `[]`           | Available language codes.               |
| `currentLang` | `Ref<string>`                    | `ref('')`      | Active language ref.                    |
| `immediate`   | `boolean`                        | `false`        | Validate immediately on mount.          |
| `debounce`    | `number`                         | `300`          | Global validator debounce (ms).         |
| `registry`    | `FieldRegistry`                  | — **required** | Field component registry.               |

**Returns:**

| Member           | Type                                                                             | Description                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `isDirty`        | `ComputedRef<boolean>`                                                           | `true` when model differs from the last save baseline.                                                                      |
| `isLoading`      | `Ref<boolean>`                                                                   | `true` while async validators are running.                                                                                  |
| `readonly`       | `Ref<boolean>`                                                                   | Controls read-only mode for all fields.                                                                                     |
| `currentLang`    | `Ref<string>`                                                                    | Active language.                                                                                                            |
| `getFieldValue`  | `(key) => unknown`                                                               | Get a field's value by key or descriptor.                                                                                   |
| `setFieldValue`  | `(key, val) => void`                                                             | Set a field's value.                                                                                                        |
| `getClientError` | `(key) => string \| undefined`                                                   | Get the first client-side error for a field.                                                                                |
| `markTouched`    | `(key) => void`                                                                  | Mark a field as touched (triggers immediate validation).                                                                    |
| `isTouched`      | `(key) => boolean`                                                               | Check if a field has been touched.                                                                                          |
| `validateClient` | `() => { valid: boolean, errors: Record<string, string> }`                       | Run all client validators synchronously.                                                                                    |
| `resetDirty`     | `() => void`                                                                     | Reset the dirty-tracking baseline (call after a successful save).                                                           |
| `getPatch`       | `() => Partial<T>`                                                               | Return only changed fields since the last `resetDirty`.                                                                     |
| `submit`         | `(handler: (payload, isNew) => Promise<void>, isNew?: boolean) => Promise<void>` | Validate all fields, then call `handler`. On success calls `resetDirty` and clears touched state. No-op if already loading. |

---

### `useFormFromSchema(schema, options?)`

Generates a `FieldDescriptor[]` array from a JSON Schema document.

| Parameter           | Type                                       | Default        | Description                                                    |
| ------------------- | ------------------------------------------ | -------------- | -------------------------------------------------------------- |
| `schema`            | `JSONSchema`                               | — **required** | JSON Schema document (Pydantic v2, DRF Spectacular, or plain). |
| `options.exclude`   | `string[]`                                 | `[]`           | Top-level keys to skip (e.g. `['id', 'created_at']`).          |
| `options.overrides` | `Record<string, Partial<FieldDescriptor>>` | `{}`           | Per-field descriptor overrides applied after schema mapping.   |

**Returns:** `FieldDescriptor[]` — Ready to pass to `MapoForm` or `MapoDetail`.

---

### `useFormDraft(options)`

Persists the form model to `localStorage` with debounce and TTL.

| Option      | Type                                | Default        | Description                                                                                      |
| ----------- | ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `model`     | `Ref<T>`                            | — **required** | Form model to persist.                                                                           |
| `isDirty`   | `Ref<boolean>`                      | — **required** | Dirty flag (draft is only saved when dirty).                                                     |
| `key`       | `string`                            | — **required** | Unique storage key (prefixed as `mapo:draft:<key>`).                                             |
| `debounce`  | `number`                            | `2000`         | Write delay in milliseconds.                                                                     |
| `ttl`       | `number`                            | `86400000`     | Draft TTL in milliseconds (default 24 h).                                                        |
| `onRestore` | `(draft: T, savedAt: Date) => void` | —              | Callback fired on mount when a valid draft exists. `savedAt` is the timestamp of the last write. |

**Returns:**

| Member       | Signature                  | Description                                             |
| ------------ | -------------------------- | ------------------------------------------------------- |
| `clearDraft` | `() => void`               | Remove draft from `localStorage`.                       |
| `getDraft`   | `() => DraftEntry \| null` | Get the raw draft entry (includes `savedAt` timestamp). |
| `hasDraft`   | `() => boolean`            | `true` if a non-expired draft exists.                   |

---

### `useUnsavedChangesGuard(isDirty, options?)`

Registers browser `beforeunload` and Vue Router `beforeRouteLeave` guards.

| Parameter         | Type                            | Default                       | Description                             |
| ----------------- | ------------------------------- | ----------------------------- | --------------------------------------- |
| `isDirty`         | `Ref<boolean>`                  | — **required**                | Dirty flag from the form.               |
| `options.message` | `string`                        | `'You have unsaved changes.'` | Confirmation message shown to the user. |
| `options.enabled` | `Ref<boolean> \| () => boolean` | `() => true`                  | Whether the guard is active.            |

**Returns:** `void` — Guards are registered automatically and cleaned up on `onBeforeUnmount`.

---

### `useFocusMode()`

Shared state for the `MapoFocusPortal` / `MapoRepeater` focus-mode integration.

**Parameters:** none.

**Returns:**

| Member        | Type                                            | Description                                     |
| ------------- | ----------------------------------------------- | ----------------------------------------------- |
| `focusTarget` | `DeepReadonly<ShallowRef<FocusTarget \| null>>` | The currently focused repeater item, or `null`. |
| `isActive`    | `Ref<boolean>`                                  | `true` when focus mode is active.               |
| `enter`       | `(target: FocusTarget) => void`                 | Open focus mode on a specific item.             |
| `exit`        | `() => void`                                    | Close focus mode and restore the previous view. |

---

### Progressive Disclosure Helpers

Condition builders for the `showWhen` field descriptor option.

#### `when(...conditions)`

| Parameter    | Type                  | Description                     |
| ------------ | --------------------- | ------------------------------- |
| `conditions` | `Condition<TModel>[]` | Conditions to combine with AND. |

**Returns:** `Condition<TModel>` — A new condition that is `true` when **all** inputs are `true`.

---

#### `whenAny(...conditions)`

| Parameter    | Type                  | Description                    |
| ------------ | --------------------- | ------------------------------ |
| `conditions` | `Condition<TModel>[]` | Conditions to combine with OR. |

**Returns:** `Condition<TModel>` — A new condition that is `true` when **at least one** input is `true`.

---

#### `whenNot(condition)`

| Parameter   | Type                | Description          |
| ----------- | ------------------- | -------------------- |
| `condition` | `Condition<TModel>` | Condition to negate. |

**Returns:** `Condition<TModel>` — A new condition that is `true` when the input is `false`.

---

#### `matchesField(key, matcher)`

| Parameter | Type                 | Description                                                           |
| --------- | -------------------- | --------------------------------------------------------------------- |
| `key`     | `string`             | Dot-notation path to the model field.                                 |
| `matcher` | `unknown \| Matcher` | Literal value for equality, or a matcher function `(val) => boolean`. |

**Returns:** `Condition<TModel>` — A condition that is `true` when the field value satisfies the matcher.

---

#### Matcher Factories

| Factory       | Signature                      | Description                                                  |
| ------------- | ------------------------------ | ------------------------------------------------------------ |
| `isOneOf`     | `(options: T[]) => Matcher`    | `true` if value is in the options array.                     |
| `isNoneOf`    | `(options: T[]) => Matcher`    | `true` if value is NOT in the options array.                 |
| `isNotEmpty`  | `() => Matcher`                | `true` if value is non-empty (non-null, non-`""`, non-`[]`). |
| `isEmpty`     | `() => Matcher`                | `true` if value is empty.                                    |
| `greaterThan` | `(n: number) => Matcher`       | `true` if numeric value `> n`.                               |
| `lessThan`    | `(n: number) => Matcher`       | `true` if numeric value `< n`.                               |
| `matches`     | `(pattern: RegExp) => Matcher` | `true` if `String(value)` matches the regex.                 |

---

### `defineFormField(type, entry, opts?)`

Registers a custom field component in the global field registry. Must be called from a Nuxt plugin.

| Parameter       | Type                      | Description                                                  |
| --------------- | ------------------------- | ------------------------------------------------------------ |
| `type`          | `string`                  | Field type name (used as `descriptor.type`).                 |
| `entry`         | `FieldComponentEntry`     | Async or sync function returning the Vue component.          |
| `opts.attrs`    | `Record<string, unknown>` | Default `descriptor.attrs` values merged at render time.     |
| `opts.accessor` | `FieldAccessor`           | Custom `{ get(model, key), set(model, key, val) }` accessor. |
| `opts.override` | `boolean`                 | Allow replacing an existing registration without a warning.  |

**Returns:** `void`.

---

### `provideCurrentLang(lang)` / `useCurrentLang(fallback?)`

Language context helpers for nested field components.

| Function             | Parameters               | Returns       | Description                                                           |
| -------------------- | ------------------------ | ------------- | --------------------------------------------------------------------- |
| `provideCurrentLang` | `lang: Ref<string>`      | `void`        | Provide the active language to descendants.                           |
| `useCurrentLang`     | `fallback?: Ref<string>` | `Ref<string>` | Inject the current language, falling back to `fallback` or `ref('')`. |

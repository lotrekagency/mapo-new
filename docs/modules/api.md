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

**Returns:** `MenuNode[]` — Tree of navigation nodes built from route `meta` fields (`label`, `icon`, `parent`, `hidden`, `sidebarFooter`, `sidebarOrder`). At each level, finite `sidebarOrder` values sort ascending before unordered routes; ties and unordered siblings preserve router order. Sorting applies recursively.

---

### `calcMaxMenuNestDepth(nodes, depth?)`

| Parameter | Type         | Default | Description                      |
| --------- | ------------ | ------- | -------------------------------- |
| `nodes`   | `MenuNode[]` | —       | Array of menu nodes to traverse. |
| `depth`   | `number`     | `1`     | Starting depth.                  |

**Returns:** `number` — Maximum nesting depth in the tree (root level = 1).

---

### `userPermissions(user)`

| Parameter | Type      | Description                                                         |
| --------- | --------- | ------------------------------------------------------------------- |
| `user`    | `unknown` | The user payload as `userInfoApi` returns it, read as outside data. |

**Returns:** `UserPermissions` — `{ codenames, models, unreadable }`: the codenames of `all_permissions`, or of `user_permissions` when the first is missing; the `ModelPermissions` of each model; whether the backend sent permissions with no codename in them.

---

### `permissionCodenames(raw)`

| Parameter | Type      | Description                                                                                  |
| --------- | --------- | -------------------------------------------------------------------------------------------- |
| `raw`     | `unknown` | A list of permissions: codenames, objects with a `codename`, or pks. Anything else is empty. |

**Returns:** `string[]` — The codenames, in the backend's order; pks and objects without a `codename` are dropped.

---

### `modelPermissions(codenames)`

| Parameter   | Type                | Description                                  |
| ----------- | ------------------- | -------------------------------------------- |
| `codenames` | `readonly string[]` | Permission codenames such as `view_article`. |

**Returns:** `Record<string, ModelPermissions>` — `{ view, add, change, delete }` for each model named by a codename `<action>_<model>`. A model named `__proto__` is left out.

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

### `metadataToJsonSchema(metadata, options?)`

Reads an endpoint's `OPTIONS` response as JSON Schema: the `schema` it publishes (Camomilla), otherwise its Django REST Framework metadata. In a published schema, a decimal sent as a string (`type: string`, `format: decimal`) becomes a number, with the limits its `pattern` writes. `<MapoDetail>` uses it with `experimentalFieldsFromSchema`. See [From DRF metadata and OpenAPI](/uikit/form/schema-to-form#from-drf-metadata-and-openapi).

| Parameter  | Type                 | Description                                  |
| ---------- | -------------------- | -------------------------------------------- |
| `metadata` | `unknown`            | The `OPTIONS` response, as received.         |
| `options`  | `DrfMetadataOptions` | Passed to `drfMetadataToJsonSchema` (below). |

**Returns:** `JSONSchema | undefined` — `undefined` when the response describes no fields.

---

### `drfMetadataToJsonSchema(metadata, options?)`

Reads DRF's standard `OPTIONS` metadata (`SimpleMetadata`) as JSON Schema in the dialect `useFormFromSchema` reads. A field DRF calls `field`, such as a relation, becomes a placeholder type, `field:<key>`.

| Parameter          | Type                                              | Description                                                                                |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `metadata`         | `unknown`                                         | The `OPTIONS` response, as received.                                                       |
| `options.method`   | `"POST" \| "PUT"`                                 | The action to read. Default: `POST`, then `PUT`.                                           |
| `options.types`    | `Record<string, (field, key) => JSONSchema>`      | The schema of each DRF type, merged over the built-in ones.                                |
| `options.property` | `(schema, field, key) => JSONSchema \| undefined` | Rewrites the schema of each field, nested ones included; `undefined` leaves the field out. |

**Returns:** `JSONSchema | undefined` — `undefined` when the response has no fields for the action: DRF publishes `POST` only to users who can create.

---

### `openApiToJsonSchema(document, model, options?)`

Reads a component of an OpenAPI 3 document as JSON Schema in the dialect `useFormFromSchema` reads. `$ref`s are followed; a property pointing to another object component is a relation with the endpoint that lists it, or a placeholder without one.

| Parameter           | Type                                               | Description                                                                            |
| ------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `document`          | `unknown`                                          | The OpenAPI document, as received.                                                     |
| `model`             | `string`                                           | The component name, as `openApiModels` lists it.                                       |
| `options.endpoints` | `Record<string, string>`                           | The endpoint of each component the paths do not tell.                                  |
| `options.property`  | `(schema, source, key) => JSONSchema \| undefined` | Rewrites the schema of each property, nested ones included; `undefined` leaves it out. |

**Returns:** `JSONSchema | undefined` — `undefined` when the document has no such component.

---

### `openApiModels(document)`

| Parameter  | Type      | Description                        |
| ---------- | --------- | ---------------------------------- |
| `document` | `unknown` | The OpenAPI document, as received. |

**Returns:** `OpenApiModel[]` — every object component (`name`, `title`, `description`), with the collection `endpoint` that lists it when the paths tell, sorted by name.

---

## Form — `@mapomodule/form`

### `useMapoForm(options)`

Core composable powering `MapoForm`. Provides dirty tracking, validation, and submit flows.

| Option        | Type                             | Default        | Description                                                                                            |
| ------------- | -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `model`       | `Ref<T>`                         | — **required** | Reactive form model.                                                                                   |
| `fields`      | `MaybeRef<FieldDescriptor<T>[]>` | — **required** | Field descriptors (static or reactive).                                                                |
| `errors`      | `Ref<Record<string, string[]>>`  | `{}`           | Server-side validation errors.                                                                         |
| `languages`   | `string[]`                       | `[]`           | Available language codes.                                                                              |
| `currentLang` | `Ref<string>`                    | `ref('')`      | Active language ref.                                                                                   |
| `immediate`   | `boolean`                        | `false`        | Validate immediately on mount.                                                                         |
| `debounce`    | `number`                         | `300`          | Global validator debounce (ms).                                                                        |
| `registry`    | `FieldRegistry`                  | — **required** | Field component registry.                                                                              |
| `annotations` | `MaybeRef<FieldAnnotations>`     | —              | Marks on the fields, keyed by the path of the value. See [Field annotations](/uikit/form/annotations). |

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

Generates a `FieldDescriptor[]` array from a JSON Schema document. It also reads back the schemas `fieldsToJsonSchema` writes.

| Parameter           | Type                                       | Default        | Description                                                    |
| ------------------- | ------------------------------------------ | -------------- | -------------------------------------------------------------- |
| `schema`            | `JSONSchema`                               | — **required** | JSON Schema document (Pydantic v2, DRF Spectacular, or plain). |
| `options.exclude`   | `string[]`                                 | `[]`           | Top-level keys to skip (e.g. `['id', 'created_at']`).          |
| `options.overrides` | `Record<string, Partial<FieldDescriptor>>` | `{}`           | Per-field descriptor overrides applied after schema mapping.   |

**Returns:** `FieldDescriptor[]` — Ready to pass to `MapoForm` or `MapoDetail`.

---

### `fieldsToJsonSchema(fields, options?)`

Describes a form as a JSON Schema that `useFormFromSchema` reads back into equivalent descriptors: one property per field, with Mapo's own details in `x-mapo-field` and `x-mapo-attrs`. A pure function, also exported from `mapomodule/types`. See [From form to JSON Schema](/uikit/form/schema-to-form#from-form-to-json-schema).

| Parameter          | Type                                                                         | Default        | Description                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `fields`           | `AnyFieldDescriptor[]`                                                       | — **required** | The descriptors, as passed to `MapoForm`.                                                                              |
| `options.property` | `(schema: JSONSchema, field: AnyFieldDescriptor) => JSONSchema \| undefined` | —              | Called for every field, those of repeaters included: returns the schema to use, or `undefined` to leave the field out. |

**Returns:** `JSONSchema` — an object schema: one property per field, named by its key, and `required` listing the required fields.

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

### `useFieldAnnotation(descriptor)`

The annotation of a field, the one its mark shows. Call it in a custom field component to highlight the field, show the annotation's text or offer its actions inside the field. See [Field annotations](/uikit/form/annotations#read-the-annotation-in-a-custom-field).

| Parameter    | Type                                   | Description                                |
| ------------ | -------------------------------------- | ------------------------------------------ |
| `descriptor` | `MaybeRefOrGetter<AnyFieldDescriptor>` | The field's descriptor, or a getter of it. |

**Returns:** `ComputedRef<FieldAnnotation | undefined>` — the entry at the path of the field's value; for a translatable field, otherwise the entry at its bare key. Inside a repeater item it reads the item's annotations; outside a form it is always `undefined`.

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

---

## UIKit — `@mapomodule/uikit`

### `useMapoDetail()`

The context of the `MapoDetail` around the calling component: endpoint, id, `isNew`, `modelName` and `permissionModel`, the model (writable), the fields rendered, languages, registry, errors and state, `save()` and `back()`, the `annotations` channel, `metadata()`, the endpoint's `OPTIONS` response requested once per page, and the page's `schemaFromMetadata`. See [Detail page](/uikit/detail#how-to-read-the-detail-from-a-component-inside-it).

**Returns:** `MapoDetailContext<T> | undefined` — `undefined` outside a `MapoDetail`.

---

### `defineDetailExtension(extension)`

Adds a component to every `MapoDetail` of the app. Call it from a Nuxt plugin. See [Detail page](/uikit/detail#how-to-add-an-action-to-every-detail-page).

| Parameter             | Type                                     | Description                                                                               |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `extension.key`       | `string`                                 | Names the extension; registering a key again replaces it.                                 |
| `extension.placement` | `"actions" \| "body-top"`                | The sidebar card above Save, or above the body form.                                      |
| `extension.component` | `Component \| () => Promise<Component>`  | The component, or a function that imports it. It reads the detail with `useMapoDetail()`. |
| `extension.visible`   | `(detail: MapoDetailContext) => boolean` | Whether a page shows it. Default: always.                                                 |
| `extension.order`     | `number`                                 | Order among the extensions of a placement, lower first. Default: `0`.                     |

**Returns:** `() => void` — removes the extension.

---

## AI — `@mapomodule/ai`

Experimental, installed with `mapo.ai`. `useMapoAiFill()` and `useMapoAiRead()` are auto-imported in the app's components; the other functions in the app's server code, such as a Nitro plugin in `server/plugins/`, not in components or Nuxt plugins. See [AI-assisted entry](/modules/ai).

### `useMapoAiFill(target, options?)`

Fills a detail form from a source, through the gateway's `run`: each value a quote verifies goes into an empty field by itself, and the others wait for the operator, marked on their fields. Call it in a detail extension. See [Fill a detail form](/modules/ai#fill-a-detail-form).

| Parameter                    | Type                                    | Default                | Description                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                     | `MapoAiFillTarget`                      | — **required**         | The form: `useMapoDetail()`, or an object with `model`, `fields` and `annotations`, and optionally `sidebarFields`, `metadata()`, `isNew`, `currentLang`, `languages`, `registry`, `readonly` and `isBusy`. |
| `options.entity`             | `MapoAiFillEntity`                      | —                      | What the AI should know about the record: `label`, `description`, `model` (for the permission check), `exclude`, `relationChoices`, `evidence`.                                                             |
| `options.schemaFromMetadata` | `(metadata) => JSONSchema \| undefined` | `metadataToJsonSchema` | Reads the backend's schema from the endpoint's `OPTIONS` response.                                                                                                                                          |

**Returns:** `MapoAiFill`:

| Member     | Type                                                                                      | Description                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill`     | `(source: string \| readonly MapoAiSourcePart[], call?: MapoAiFillCall) => Promise<void>` | Sends the source with `call.instructions` and `call.provider`, then writes and marks the answer. Never rejects: a failure goes to `error`. A new call stops the previous one's wait and removes its marks. |
| `apply`    | `(path: string) => void`                                                                  | Writes the AI's value of a field that waits, by its path: one to confirm, or one put back with `restore()`.                                                                                                |
| `restore`  | `(path: string) => void`                                                                  | Puts back what the field held before the AI's value went in, while the field still holds that value.                                                                                                       |
| `dismiss`  | `(path?: string) => void`                                                                 | Removes the AI's mark of a field, or all of them; the values stay.                                                                                                                                         |
| `undo`     | `() => void`                                                                              | Puts back every field that still holds the AI's value, as it was before, and removes the AI's marks.                                                                                                       |
| `cancel`   | `() => void`                                                                              | Stops waiting for the answer; the gateway still finishes the call.                                                                                                                                         |
| `pending`  | `Readonly<Ref<boolean>>`                                                                  | A call is waiting for its answer.                                                                                                                                                                          |
| `error`    | `Readonly<Ref<MapoAiFillError \| undefined>>`                                             | `{ status, message, retryAfter? }`: why the last call got no answer; `status` is `0` without one.                                                                                                          |
| `response` | `Readonly<Ref<MapoAiFillResponse \| undefined>>`                                          | The last answer of `run`: the outcomes, or the model's refusal.                                                                                                                                            |
| `fields`   | `Readonly<Ref<readonly MapoAiFillField[]>>`                                               | Each field of the answer: `key`, `path`, `action`, `replaces`, `applied` and the `outcome`.                                                                                                                |

---

### `useMapoAiRead()`

Reads the operator's files into text through the gateway's `read`, as `run` takes it: for a page that lets the operator give the AI a file instead of a pasted text. Reading calls no AI and keeps nothing of the file. See [Send a file](/modules/ai#send-a-file).

**Returns:** `MapoAiRead`:

| Member | Type                                                                       | Description                                                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read` | `(file: Blob, options?: MapoAiReadOptions) => Promise<MapoAiReadResponse>` | Posts the file, as the field `file` of a form, and resolves with the answer: `status: "read"` with the `parts` to give `useMapoAiFill().fill()`, or `unsupported`, `empty`, `too-long`, `failed`. It rejects with the error of the call, and with `MapoAiReadAnswerError` for an answer it cannot read. |

`options` of `read`:

| Option   | Type          | Default                        | Description                        |
| -------- | ------------- | ------------------------------ | ---------------------------------- |
| `name`   | `string`      | The `File`'s name, else `file` | The name of a `Blob` that has none |
| `signal` | `AbortSignal` | —                              | Stops waiting for the answer       |

---

### `<MapoAiSettings />`

The AI settings, as the page the module adds at `/ai-settings` shows them: each user picks their provider and model, sees their key, saves their own token where allowed and checks the connection; the AI's admins also assign keys, order the groups and remove the users' tokens, and change how the AI works in the whole app: instructions, rules of verification, words of secret fields, the providers' prompt cache, Anthropic's fallbacks and the models they add; each user sees their own usage, the admins everyone's and the log of the changes. It has no props, events or slots. For a page of the app's own, set `mapo.ai.settings.path` to `false` and put the component in it. See [AI settings](/modules/ai#ai-settings).

---

### `registerMapoAiProvider(provider)`

Registers a provider the app implements, from a Nitro plugin. `run` calls it only when `mapo.ai.providers` enables its id, with the models it may use. See [Your own provider](/modules/ai#your-own-provider).

| Parameter  | Type             | Default        | Description                                                                                                                                      |
| ---------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provider` | `MapoAiProvider` | — **required** | `id` (lowercase letters, digits and `-`, starting with a letter), `label?`, `key?`, `capabilities`, `models?`, `listModels?` and `run(request)`. |

**Returns:** `void`. It throws a `TypeError` when the id is not a provider's id or `run` is missing, and an `Error` when the id is one Mapo keeps (`mock`, `openai`, `anthropic`, `openai-compatible`, `ollama`) or is registered already.

With `key` (`"required"` or `"optional"`), each call gets the key the gateway's chain chose for the user as `request.apiKey`: their own token where an admin allows it, an admin's key, or the project's, from `NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY`. See [Keys](/modules/ai#keys). `listModels(signal, apiKey)` gets the project's key when the server starts, and the user's when the [AI settings](/modules/ai#ai-settings) check the connection, or the admin's when they add a model ([How the AI works](/modules/ai#how-the-ai-works)).

---

### `registerMapoAiMockFixtures(list)`

Registers answers of the `mock` provider, from a Nitro plugin. See [Fixtures of the mock](/modules/ai#fixtures-of-the-mock).

| Parameter | Type                           | Default        | Description                                                                                                                                                                                            |
| --------- | ------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list`    | `readonly MapoAiMockFixture[]` | — **required** | Each with a `name` (lowercase letters, digits, `-` and `_`), an `answer` written as a model writes it or a `refusal`, and optionally the `source` it answers without a mark and the `usage` to report. |

**Returns:** `void`. It throws a `TypeError` when a name is not one, or a fixture has neither an answer nor a refusal, or both, and an `Error` when a name is registered already.

---

### `new MapoAiProviderError(failure, message, options?)`

The error a provider's `run()` throws for a failure the gateway tells apart: `timeout` answers 504, `rate-limit` 503, `too-long` 413 and the others 502, as does any other error; the answer names the failure in `data.failure`. See [Your own provider](/modules/ai#your-own-provider).

| Parameter            | Type                    | Default        | Description                                                                                                    |
| -------------------- | ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `failure`            | `MapoAiProviderFailure` | — **required** | `timeout`, `rate-limit`, `too-long`, `unavailable`, `invalid-response`, `refused-request` or `truncated`.      |
| `message`            | `string`                | — **required** | For the server's log; the browser never sees it.                                                               |
| `options.retryAfter` | `number`                | —              | For `rate-limit`: in how many seconds the provider takes calls again; the gateway answers it as `Retry-After`. |
| `options.cause`      | `unknown`               | —              | The error behind it.                                                                                           |

**Returns:** `MapoAiProviderError` — with its `failure`, and `retryAfter` when given.

---

### `registerMapoAiReader(reader)`

Registers a reader of files the app implements, from a Nitro plugin: in place of Mapo's reader with the same id, or for a format of its own. The gateway gives a file to the reader of its name's extension, the app's before Mapo's, and only then to the reader of its media type; `mapo.ai.readers` turns a reader off by its id. See [Replace or add a reader](/modules/ai#replace-or-add-a-reader).

| Parameter | Type           | Default        | Description                                                                                                                                                                                                                                                          |
| --------- | -------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reader`  | `MapoAiReader` | — **required** | `id` (lowercase letters, digits and `-`, starting with a letter; `text`, `markdown`, `json`, `html`, `csv` and `xlsx` are Mapo's), `label?`, `extensions` (without the dot), `types?` (media types) and `read(file)`, which returns text parts or a promise of them. |

**Returns:** `void`. It throws a `TypeError` when the id is not a reader's, `read` is missing, or the reader lists no extension and no media type (or one that is none), and an `Error` when the id is registered already.

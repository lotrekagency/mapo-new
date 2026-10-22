# @mapomodule/example-custom-form

The form engine of Mapo v2 without UIKit or Nuxt UI. The app registers only `@mapomodule/core` and `@mapomodule/form`, replaces the field registry with Vuetify components, and builds its own layout and list with Vuetify. Use it as the reference for a headless setup or for a different component library.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build              # once after cloning
pnpm dev:example-form   # http://localhost:3001
```

The backend is a mock in `server/api/`: any non-empty username and password log you in as `admin`. The data lives in memory and resets when the server restarts.

## What's demonstrated

| Page         | Feature                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `/login`     | `useMapoAuth().login()` behind a Vuetify form                                              |
| `/`          | Overview of the setup                                                                      |
| `/news`      | A server-paginated `v-data-table-server` list                                              |
| `/news/[id]` | `useMapoForm()` and `MapoFormField` rendering the descriptors through the Vuetify registry |

## How the registry is replaced

[`app/plugins/mapo-vuetify-registry.ts`](app/plugins/mapo-vuetify-registry.ts) runs after the registry plugin of `@mapomodule/form` and replaces `$mapoFormRegistry.mapping` with the wrappers in [`app/components/fields/`](app/components/fields/): `text`, `textarea`, `number`, `select`, `boolean`, `switch`, `date` and `datetime`. Any other `type` renders `MapoUnknownField`.

Each wrapper follows the field contract of the form engine: the `modelValue`, `descriptor`, `errors`, `readonly` and `disabled` props, and the `update:modelValue` event.

## See also

- [`docs/uikit/form/registry.md`](../../docs/uikit/form/registry.md): the field registry, including swapping the UI library
- [`docs/uikit/form/custom-fields.md`](../../docs/uikit/form/custom-fields.md): writing a field component
- [`apps/example-e2e/`](../example-e2e/): the reference app, with the full UIKit

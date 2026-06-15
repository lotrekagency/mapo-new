# example-e2e

Nuxt 4 app used as the target for Mapo's E2E test suite. It exercises every major feature area — auth, permissions, sidebar, form engine, feedback, etc. — with one dedicated page per scenario.

## Running locally

From the monorepo root:

```bash
# Stub packages (required for correct IDE types)
pnpm dev:packages

# Generate Nuxt auto-import types
cd apps/example-e2e && pnpm nuxt prepare && cd ../..

# Start the dev server
pnpm dev:example-e2e
```

The app is available at `http://localhost:3000`.

## Pages

| Route                     | What it tests                                                   |
| ------------------------- | --------------------------------------------------------------- |
| `/auth`                   | Login / logout flow                                             |
| `/permissions-model`      | `permissions: { model }` middleware — pagePermissions populated |
| `/permissions-raw`        | `permissions: string[]` middleware — route gate only            |
| `/roles-admin`            | Role-based access (`admin` group required)                      |
| `/form/*`                 | Form engine scenarios (validation, repeater, draft, etc.)       |
| `/feedback`               | `useSnackStore` + `useConfirmStore`                             |
| `/settings`               | `sidebarFooter` meta                                            |
| `/sidebar-parent/*`       | Nested sidebar navigation                                       |
| `/store`                  | Raw store state inspection                                      |
| `/camomilla-integrations` | Camomilla proxy integration                                     |

## Adding a new page

1. Create `app/pages/<scenario>.vue` with `definePageMeta({ label, icon, middleware })`.
2. The page is automatically added to the sidebar (no manual menu config needed).
3. Document the E2E plan in `e2e/modules/<area>.md`.

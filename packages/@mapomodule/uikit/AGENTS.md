# AGENTS.md — `@mapomodule/uikit`

Local rules for the admin shell and the CRUD components. The root [`AGENTS.md`](../../../AGENTS.md) still applies. Adding a component has its own procedure: [`docs/contributing/add-component.md`](../../../docs/contributing/add-component.md).

## What this package is

Everything an admin user sees around and on top of the form engine: the `mapo-default` and `mapo-empty` layouts, sidebar, topbar, login, snackbar and confirm dialog; `MapoList` and `MapoDetail`; the media manager and its store; the menu manager; theming through `mapo.uikit.css` and `mapo.uikit.ui`; and the MapoOverride system. It depends on `core`, `store`, `form`, `i18n`, `utils` and `@nuxt/ui`.

## Layout

```text
src/
  module.ts                  options (css, ui, media), the `components` list, layouts, the default
                             /login and / pages, the media adapter plugin, useMediaStore, MapoOverride hook
  index.ts                   public types (resolved as @mapomodule/uikit/types)
  runtime/components/        Mapo*.vue
  runtime/composables/       useMapoDetail (the detail context), defineDetailExtension (detail extensions)
  runtime/layouts/           default.vue (mapo-default), empty.vue (mapo-empty)
  runtime/pages/             login.vue, index.vue: added only when the app has no page on that path
  runtime/stores/media.ts    useMediaStore
  runtime/adapters/          defaultMediaAdapter; integrations override it with a later plugin
  runtime/types/             list, media, menu and detail (context, extensions) types
  runtime/assets/main.css    Tailwind sources and safelist, shared with @mapomodule/form
```

## Rules

1. **Registration is explicit.** A component exists only if its name is in the `components` list of `module.ts`. `global: true` is reserved for components another package resolves by name at runtime (`MapoMediaManagerDialog`, `MapoMediaPreview`).
2. **Props, events and slots are public API.** Apps replace components with `app/mapooverride/<Name>.vue` and reuse their slots; a rename breaks them silently. Breaking changes are committed as `feat!:` and documented.
3. **No hardcoded labels.** `useI18n().t("mapo.…")`, keys in both catalogs of `@mapomodule/i18n`, `aria-label` included.
4. **Theme through tokens.** Nuxt UI components, Tailwind utilities, semantic tokens. Runtime-built classes go in the `@source inline(...)` safelist of `main.css`.
5. **DOM-only libraries render client-side.** `vue-draggable-plus` (lists and menu tree) touches `document`: keep those parts in `<ClientOnly>`.
6. **Media goes through the adapter.** Requests and response shapes of the media manager pass through `$mapoMediaAdapter` (plugin order 5), so backend integrations can reshape them. Do not call media endpoints around it.
7. **JSDoc on every prop and event**: `mapo_component_api` serves it to assistants.

## Change together

| You change                           | Also change                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| A component's props, events or slots | `docs/uikit/api.md`, its narrative page in `docs/uikit/`, MCP recipes if a task changes              |
| The detail context or extensions     | `docs/uikit/detail.md` (context and extensions sections), `docs/uikit/api.md`, `docs/modules/api.md` |
| The layout slots                     | `docs/uikit/layout.md`, `docs/howto/theming.md`, the MCP `mapo-theme` prompt if it names them        |
| `mapo.uikit` options                 | `docs/uikit/theming.md`, `docs/guide/concepts.md` if the config shape changes                        |
| The media adapter contract           | `docs/uikit/media.md`, `docs/howto/media-manager.md`                                                 |
| Route meta handling (sidebar)        | `docs/uikit/sidebar.md`; the page-meta types in `runtime/page-meta.nuxt.d.ts`                        |

## Verify

```bash
pnpm --filter @mapomodule/uikit typecheck     # vue-tsc
pnpm --filter @mapomodule/uikit lint
pnpm exec vitest run packages/@mapomodule/uikit   # not part of `pnpm test`
```

Then check it live in `apps/example-e2e` (lists, media, menus, sidebar pages), and for theming changes in `apps/example-theme` too. List the breakpoints and colour modes the reviewer should look at.

## Gotchas

- **A class has no effect** → it is built at runtime and missing from the `main.css` safelist.
- **`Overriding MapoMediaManagerDialog component` in every app build** → `module.ts` registers that component twice: in the `components` list and again as `global`. It is a known warning (open thread in the root manual).
- **The built-in login page shows instead of the app's** → the module adds `/login` and `/` only when the app has no page on that exact path; check the app's file name.
- **`MapoConfirmDialog` has no accessible name** → its title is a plain heading in the modal content (open thread in the root manual).
- **A dialog opens under a drawer or another modal** → Nuxt UI overlays have no z-index and stack by the order their portals enter `<body>`, which is when they mount. An overlay mounted ahead of time, in a layout, sits under the ones a page opens later: mount it when it opens, as `MapoConfirmDialog` does.

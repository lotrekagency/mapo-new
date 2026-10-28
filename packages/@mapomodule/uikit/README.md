# @mapomodule/uikit

Everything an admin user sees in Mapo: the layouts, sidebar, topbar and login page, the list and detail pages, the media manager, the menu editor and the feedback components, plus theming and the MapoOverride system. Built on Nuxt UI v4 and Tailwind CSS v4.

## Installation

Install it through the meta-package [`mapomodule`](https://www.npmjs.com/package/mapomodule), which also registers the `core`, `store`, `form` and `i18n` modules these components rely on. Configure it under `mapo.uikit`, and register `@nuxt/ui` before `mapomodule`:

```bash
pnpm add mapomodule@next @nuxt/ui
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    uikit: {
      css: "~/assets/css/theme.css",
      media: {
        endpoints: { media: "/api/media", folders: "/api/media-folders" },
      },
    },
  },
});
```

Mapo v2 is published on the `next` dist-tag while it is in beta.

| Option                    | Default                | Description                                                                                   |
| ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `css`                     | —                      | Your CSS file, loaded after Mapo's base CSS so its tokens win                                 |
| `ui`                      | `{}`                   | Nuxt UI component defaults, merged into `nuxt.options.ui`; keys the app sets there itself win |
| `media.endpoints.media`   | `"/api/media"`         | Media endpoint                                                                                |
| `media.endpoints.folders` | `"/api/media-folders"` | Media folders endpoint                                                                        |
| `media.maxImageSize`      | `10`                   | Upload limit for images, in MB                                                                |
| `media.maxVideoSize`      | `100`                  | Upload limit for videos, in MB                                                                |
| `media.permissionsModel`  | `"media"`              | Django model whose permissions gate editing and deleting in the media editor                  |

## What you get

Components are auto-imported.

| Area     | Components and APIs                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell    | The `mapo-default` and `mapo-empty` layouts, `MapoSidebar` (built from route metadata), `MapoTopbar`, `MapoLogin`, `MapoThemeToggle`, `MapoLangSwitcher`, `MapoLogoutButton`; a `/login` and a `/` page when the app has none |
| Lists    | `MapoList`: server-side pagination, search, sorting, filters, tabs, bulk actions, drag reorder and quick edit, with the state synced to the URL                                                                               |
| Details  | `MapoDetail`: loads the record, renders the form, saves a differential `PATCH`, maps 400 errors onto fields, drafts and per-language editing; `useMapoDetail()` and `defineDetailExtension()` for what goes inside            |
| Media    | `MapoMediaManager`, the `MapoMediaManagerDialog` picker, `useMediaStore`, and `$mapoMediaAdapter`, which backend integrations replace                                                                                         |
| Menus    | `MapoMenuManager`: a drag-and-drop tree editor with per-language trees                                                                                                                                                        |
| Feedback | `MapoSnackBar` and `MapoConfirmDialog`, driven by the store and mounted by `MapoRootComponents` in `mapo-default`                                                                                                             |

The layout exposes the slots `sidebar:logo`, `sidebar:nav-top`, `sidebar:nav-bottom`, `sidebar:footer`, `topbar:left`, `topbar` and `topbar:right`. Every component's props, events and slots are in the component API reference.

## Customization

Pick the lightest layer that does the job:

1. **CSS tokens** through `mapo.uikit.css`, for colours, radius and dark mode.
2. **Nuxt UI defaults** through `mapo.uikit.ui`, for component variants across the app.
3. **Slots** on the layout and on Mapo components, for structural additions.
4. **Detail extensions**: `defineDetailExtension()` adds an action or a section to every `MapoDetail`, which reads the record with `useMapoDetail()`.
5. **MapoOverride**: a file at `app/mapooverride/<Name>.vue` replaces the registered component with that name at build time. Keep its props, events and slots compatible; from then on you own its updates.

## Documentation

- [UIKit](https://lotrekagency.github.io/mapo-new/uikit/)
- [Layout](https://lotrekagency.github.io/mapo-new/uikit/layout), [Sidebar](https://lotrekagency.github.io/mapo-new/uikit/sidebar), [Login](https://lotrekagency.github.io/mapo-new/uikit/login)
- [MapoList](https://lotrekagency.github.io/mapo-new/uikit/list), [MapoDetail](https://lotrekagency.github.io/mapo-new/uikit/detail)
- [Media Manager](https://lotrekagency.github.io/mapo-new/uikit/media), [Menu Manager](https://lotrekagency.github.io/mapo-new/uikit/menu-manager)
- [Theming](https://lotrekagency.github.io/mapo-new/uikit/theming), [MapoOverride System](https://lotrekagency.github.io/mapo-new/uikit/mapoverride)
- [UIKit — Component API Reference](https://lotrekagency.github.io/mapo-new/uikit/api)

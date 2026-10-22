# @mapomodule/example-theme

The theming and component override demo of Mapo v2. It needs no backend: the pages have no auth middleware.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build                # once after cloning
pnpm dev:example-theme    # http://localhost:3001
```

## What's demonstrated

| Page              | Customization                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `/`               | Overview, with links to every section                                                         |
| `/css-tokens`     | CSS token overrides through `mapo.uikit.css`: primary palette, semantic tokens, radius        |
| `/nuxt-ui-config` | Global component defaults through `mapo.uikit.ui` in `nuxt.config.ts`                         |
| `/mapoverride`    | Full component replacement through `app/mapooverride/`: `MapoTopbar`, `MapoLogin`             |
| `/slots`          | The layout slots: `sidebar:logo`, `topbar:right`, …                                           |
| `/dark-mode`      | Semantic tokens in dark and light mode                                                        |
| `/form-registry`  | Form customization: a custom field type in a per-page registry, a field slot, `descriptor.is` |

## Customization layers in this app

| File                                                                 | What it configures                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`nuxt.config.ts`](nuxt.config.ts)                                   | `mapo.uikit.css` and the `mapo.uikit.ui` component defaults           |
| [`app/assets/css/theme.css`](app/assets/css/theme.css)               | Primary colour (violet), semantic tokens, radius, dark mode overrides |
| [`app/mapooverride/MapoTopbar.vue`](app/mapooverride/MapoTopbar.vue) | A custom topbar with a gradient and a dark mode toggle                |
| [`app/mapooverride/MapoLogin.vue`](app/mapooverride/MapoLogin.vue)   | A fully custom login page built on `useMapoAuth`                      |

## See also

- [`docs/uikit/theming.md`](../../docs/uikit/theming.md): the theming reference
- [`docs/uikit/mapoverride.md`](../../docs/uikit/mapoverride.md): how MapoOverride works
- [`apps/example-e2e/`](../example-e2e/): the reference app, with an in-memory mock API
- [`apps/example/`](../example/): the core demo, which needs a Camomilla backend

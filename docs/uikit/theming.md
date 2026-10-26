# Theming

`@mapomodule/uikit` builds on **Tailwind CSS v4** and **Nuxt UI v3**. All visual customization flows through CSS custom properties (design tokens) — you never need to fork components.

## How styles are injected

The uikit module injects its own CSS entry point at build time:

```css
/* @mapomodule/uikit/src/runtime/assets/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
```

This is `unshift`-ed into `nuxt.options.css` so it loads before your app's CSS. Any CSS you add afterwards wins.

The same file sets a few base rules: the height chain of the layout, the `--mapo-topbar-height` token, and the pointer cursor on enabled buttons (`button` and `[role="button"]`), which Tailwind v4 dropped and Nuxt UI does not add. Disabled buttons keep Nuxt UI's `not-allowed` cursor. To go back to the arrow, repeat the rule with `cursor: default` inside `@layer base` in your CSS: it loads after Mapo's, so it wins, and Nuxt UI's utilities still apply. An unlayered rule would also override the `not-allowed` cursor.

## Overriding the theme with a CSS file

Pass a path to any CSS file via the `uikit.css` option. It is appended **after** the base CSS, so your rules always win:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    uikit: {
      css: "~/assets/css/theme.css",
    },
  },
});
```

```css
/* assets/css/theme.css — overrides Tailwind and Nuxt UI tokens */
@import "@nuxt/ui";

:root {
  --color-primary-50: oklch(0.97 0.02 240);
  --color-primary-100: oklch(0.93 0.05 240);
  --color-primary-200: oklch(0.86 0.09 240);
  --color-primary-300: oklch(0.77 0.13 240);
  --color-primary-400: oklch(0.67 0.17 240);
  --color-primary-500: oklch(0.55 0.2 240); /* ← brand color */
  --color-primary-600: oklch(0.46 0.19 240);
  --color-primary-700: oklch(0.38 0.16 240);
  --color-primary-800: oklch(0.3 0.12 240);
  --color-primary-900: oklch(0.22 0.08 240);
  --color-primary-950: oklch(0.15 0.05 240);
}
```

### Available design tokens

Nuxt UI v3 exposes semantic tokens consumed by every component:

| Token                   | Used for                         |
| ----------------------- | -------------------------------- |
| `--color-primary-*`     | Buttons, links, active states    |
| `--color-neutral-*`     | Text, borders, backgrounds       |
| `--color-success-*`     | Success badges and alerts        |
| `--color-error-*`       | Error states                     |
| `--color-warning-*`     | Warning states                   |
| `--color-info-*`        | Info states                      |
| `--ui-bg`               | Base background (`bg-default`)   |
| `--ui-bg-elevated`      | Cards and elevated surfaces      |
| `--ui-border`           | Default border color             |
| `--ui-text`             | Default text (`text-default`)    |
| `--ui-text-highlighted` | Headings and emphasized text     |
| `--ui-text-muted`       | Secondary text                   |
| `--ui-radius`           | Border radius for all components |

For the full token list see the [Nuxt UI theming docs](https://ui.nuxt.com/getting-started/theme).

### Dark mode

Nuxt UI v3 supports dark mode via a `dark` class on `<html>`. Toggle it freely — all Mapo components respond automatically through the semantic tokens.

## Overriding Nuxt UI component defaults

Pass component config under `uikit.ui`. This is deep-merged into `nuxt.options.ui` so individual component defaults are overridden without replacing everything:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    uikit: {
      ui: {
        button: {
          defaultVariants: {
            color: "primary",
            variant: "solid",
          },
        },
        card: {
          slots: {
            root: "rounded-xl shadow-sm",
          },
        },
      },
    },
  },
});
```

Any key accepted by `nuxt.options.ui` works here. See the [Nuxt UI component config reference](https://ui.nuxt.com/getting-started/theme#component-theme).

## Using both together

You can combine CSS token overrides with Nuxt UI component defaults:

```ts
export default defineNuxtConfig({
  mapo: {
    uikit: {
      css: "~/assets/css/theme.css", // token overrides
      ui: {
        button: {
          defaultVariants: { size: "md" },
        },
      },
    },
  },
});
```

## Configuring directly on the uikit module

If you register `@mapomodule/uikit` directly (without the meta-package) use `mapoUikit`:

```ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@mapomodule/uikit"],

  mapoUikit: {
    css: "~/assets/css/theme.css",
    ui: {
      /* ... */
    },
  },
});
```

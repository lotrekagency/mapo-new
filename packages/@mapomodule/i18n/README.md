# @mapomodule/i18n

The internationalization module of Mapo. It installs [`@nuxtjs/i18n`](https://i18n.nuxtjs.org) v10 with defaults suited to an admin interface and registers the English and Italian catalogs that every Mapo component reads, under the `mapo.*` key namespace.

## Installation

Installed by the meta-package [`mapomodule`](https://www.npmjs.com/package/mapomodule), which configures it under `mapo.i18n`, and by `@mapomodule/uikit` and `@mapomodule/form` when the app does not register it. On its own it reads the `mapoI18n` key:

```bash
pnpm add @mapomodule/i18n@next
```

Mapo v2 is published on the `next` dist-tag while it is in beta.

## Defaults

- `no_prefix` strategy, `en` and `it` locales, `en` as default and fallback locale.
- Browser language detection on the first visit, remembered in the `i18n_redirected` cookie.
- When the app registers `@nuxtjs/i18n` itself, its configuration wins and this module only adds the Mapo catalogs.

## Options

| Option                  | Default       | Description                                                              |
| ----------------------- | ------------- | ------------------------------------------------------------------------ |
| `defaultLocale`         | `"en"`        | Default UI locale, also the fallback for missing keys                    |
| `locales`               | `en` and `it` | The available locales. A list you pass replaces the built-in one         |
| `detectBrowserLanguage` | `true`        | Detect the browser language on the first visit and keep it in a cookie   |
| `i18n`                  | —             | Extra options forwarded verbatim to `@nuxtjs/i18n`; they win over Mapo's |

A locale without a Mapo catalog (`fr`, …) shows the Mapo strings in the default locale.

## Overriding a Mapo string

Ship a locale file with the same key and register it through `locales`; your messages are merged on top of the Mapo catalogs:

```json
// i18n/locales/en.json
{ "mapo": { "listTable": { "noItems": "Nothing here yet" } } }
```

```ts
// nuxt.config.ts
mapo: {
  i18n: {
    locales: [
      { code: "en", language: "en-US", name: "English", file: "en.json" },
      { code: "it", language: "it-IT", name: "Italiano", file: "it.json" },
    ],
  },
},
```

## Translating outside components

`useMapoT()` is auto-imported. It returns the app's `t` function for code where `useI18n()` is not available: Pinia store actions, composables called outside `setup`, imperative snackbar and confirm messages.

## Types

```ts
import type { MapoI18nKey, MapoMessages } from "@mapomodule/i18n/types";
```

The `mapomodule/types` aggregator does not include them: declare `@mapomodule/i18n` in your app's dependencies to import them.

## Documentation

- [@mapomodule/i18n](https://lotrekagency.github.io/mapo-new/modules/i18n)
- [How-to: translate the admin interface](https://lotrekagency.github.io/mapo-new/howto/i18n)

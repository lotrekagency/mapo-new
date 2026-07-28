# @mapomodule/i18n

Mapo internationalization module. Wraps [`@nuxtjs/i18n`](https://i18n.nuxtjs.org) and ships the built-in UI translations for every Mapo component (English and Italian) under the `mapo.*` key namespace.

Installed automatically by the [`mapomodule`](../../mapomodule/) meta-package — you rarely need to add it yourself.

## What it does

- Installs `@nuxtjs/i18n` with admin-friendly defaults: `no_prefix` strategy, browser language detection, cookie persistence, `fallbackLocale` = `defaultLocale`.
- Registers Mapo's message catalogs (`en`, `it`) via the `i18n:registerModule` hook.
- If the consuming app already declares `@nuxtjs/i18n` in `modules[]`, the app's configuration wins and this module only contributes the Mapo catalogs.

## Configuration

```ts
// nuxt.config.ts — through the meta-package
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    i18n: {
      defaultLocale: "it",
    },
  },
});
```

Or standalone under the `mapoI18n` key:

```ts
export default defineNuxtConfig({
  modules: ["@mapomodule/i18n"],
  mapoI18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en-US", name: "English" },
      { code: "it", language: "it-IT", name: "Italiano" },
      // Bring your own language — Mapo strings fall back to defaultLocale
      { code: "fr", language: "fr-FR", name: "Français", file: "fr.json" },
    ],
  },
});
```

## Overriding / extending translations

Put your messages in the app's `i18n/locales/` directory. Project-level messages are merged **on top** of the Mapo catalogs, so re-declaring a `mapo.*` key overrides it:

```json
// i18n/locales/en.json
{
  "mapo": { "listHead": { "addNew": "New entry" } },
  "myApp": { "customTitle": "My dashboard" }
}
```

## Typed keys

```ts
import type { MapoI18nKey, MapoMessages } from "@mapomodule/i18n/types";
```

Full documentation: [`docs/modules/i18n.md`](../../../docs/modules/i18n.md).

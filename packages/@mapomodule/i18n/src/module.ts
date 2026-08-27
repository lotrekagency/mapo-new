import {
  defineNuxtModule,
  hasNuxtModule,
  installModule,
  createResolver,
  addImports,
  addTemplate,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import { defu } from "defu";
// Side-effect type import: augments NuxtHooks with `i18n:registerModule`.
import type {} from "@nuxtjs/i18n";

/**
 * Locale descriptor accepted by `mapoI18n.locales`.
 * Mirrors the shape of `@nuxtjs/i18n` LocaleObject without importing its types
 * (they are only available once the module is installed in the app).
 */
export interface MapoLocale {
  /** Locale code used in URLs/cookies and by `setLocale` (e.g. `"en"`). */
  code: string;
  /** BCP-47 language tag used for SEO/browser matching (e.g. `"en-US"`). */
  language?: string;
  /** Human readable name shown by `<MapoLangSwitcher>`. */
  name?: string;
  /**
   * Translation file(s) resolved from the app's `i18n/locales/` directory.
   * Only needed when the app provides its own messages for this locale.
   */
  file?: string;
  /** Multiple translation files merged in order. */
  files?: string[];
  /** Text direction. */
  dir?: "ltr" | "rtl" | "auto";
  [key: string]: unknown;
}

export interface MapoI18nOptions {
  /**
   * Default UI locale. Also used as `fallbackLocale` for missing keys.
   * @default "en"
   */
  defaultLocale?: string;

  /**
   * Locales available in the app. Defaults to English + Italian (the two
   * languages Mapo ships translations for). Add entries with `file`/`files`
   * to bring your own languages — Mapo strings fall back to `defaultLocale`
   * for locales it doesn't cover.
   */
  locales?: MapoLocale[];

  /**
   * Detect the browser language on first visit and persist the choice in a
   * cookie. Set `false` to always start from `defaultLocale`.
   * @default true
   */
  detectBrowserLanguage?: boolean;

  /**
   * Extra options forwarded verbatim to `@nuxtjs/i18n` (they win over the
   * Mapo defaults). Use this as an escape hatch for advanced setups —
   * e.g. `strategy`, `customRoutes`, `vueI18n` config path…
   * @see https://i18n.nuxtjs.org/docs/api/options
   */
  i18n?: Record<string, unknown>;
}

const MAPO_LOCALES = [
  { code: "en", language: "en-US", name: "English" },
  { code: "it", language: "it-IT", name: "Italiano" },
] satisfies MapoLocale[];

/**
 * Nuxt module that wires `@nuxtjs/i18n` into a Mapo app:
 *
 * - registers Mapo's built-in UI translations (`en`, `it`) under the `mapo.*`
 *   key namespace via the `i18n:registerModule` hook;
 * - installs `@nuxtjs/i18n` with admin-friendly defaults (`no_prefix`
 *   strategy, browser detection, cookie persistence) unless the app already
 *   declares it in `modules[]` — in that case the app's configuration wins
 *   and this module only contributes the Mapo message catalogs.
 *
 * Apps override single strings by shipping the same key in their own locale
 * files (`i18n/locales/<code>.json`): project-level messages are merged on
 * top of module-registered ones.
 */
export default defineNuxtModule<MapoI18nOptions>({
  meta: {
    name: "@mapomodule/i18n",
    configKey: "mapoI18n",
  },

  defaults: {
    defaultLocale: "en",
    detectBrowserLanguage: true,
  },

  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Auto-import the translator so consuming apps never have to import it from
    // `@mapomodule/i18n/runtime/*`: with pnpm's isolated layout that subpath is
    // only resolvable when the app lists this package in its own dependencies,
    // and apps install it transitively through `mapomodule`.
    // Registered before the early return below so it also applies when the app
    // manages @nuxtjs/i18n itself.
    addImports([
      {
        name: "useMapoT",
        from: resolver.resolve("./runtime/composables/useMapoT"),
      },
    ]);

    // Register the hook BEFORE installing @nuxtjs/i18n so the catalogs are
    // picked up regardless of module ordering in the consuming app.
    // The catalog files are named `mapo.<code>.json`, not `<code>.json`:
    // @nuxtjs/i18n keys its locale loaders by file basename, so a Mapo catalog
    // called `en.json` would collide with the app's own `i18n/locales/en.json`
    // and only one of the two would survive — silently dropping the consumer's
    // overrides.
    nuxt.hook("i18n:registerModule", (register) => {
      register({
        langDir: resolver.resolve("./runtime/locales"),
        locales: [
          { code: "en", language: "en-US", file: "mapo.en.json" },
          { code: "it", language: "it-IT", file: "mapo.it.json" },
        ],
      });
    });

    if (hasNuxtModule("@nuxtjs/i18n")) {
      // The app manages @nuxtjs/i18n itself — don't fight its configuration.
      return;
    }

    // Generated vue-i18n config: `fallbackLocale` follows `defaultLocale` so
    // locales without Mapo catalogs (e.g. a consumer-added "fr") still render
    // Mapo strings instead of raw keys.
    const vueI18nConfig = addTemplate({
      filename: "mapo-i18n.config.mjs",
      write: true,
      getContents: () =>
        `export default () => ({\n` +
        `  legacy: false,\n` +
        `  fallbackLocale: ${JSON.stringify(options.defaultLocale ?? "en")},\n` +
        `});\n`,
    });

    const i18nConfig = defu(options.i18n ?? {}, {
      strategy: "no_prefix",
      defaultLocale: options.defaultLocale ?? "en",
      locales: options.locales ?? MAPO_LOCALES,
      detectBrowserLanguage: options.detectBrowserLanguage
        ? {
            useCookie: true,
            cookieKey: "i18n_redirected",
            redirectOn: "root",
          }
        : false,
      vueI18n: vueI18nConfig.dst,
    });

    // The configuration has to land on the LAYER config, not just on
    // `nuxt.options.i18n`: @nuxtjs/i18n discovers per-locale translation files
    // by walking `nuxt.options._layers[].config.i18n` (see `getLayerI18n`),
    // which is the raw nuxt.config object and ignores anything a module writes
    // to `nuxt.options` at setup time. Writing only to `nuxt.options.i18n`
    // configures the module but silently drops every `file` declared by the
    // consuming app — so `mapo.i18n.locales` overrides would never load.
    // Both are set, and whatever the app declared itself always wins.
    // `i18n` comes from @nuxtjs/i18n's own NuxtOptions augmentation, which is
    // not resolvable here — hence the structural casts.
    const nuxtOptions = nuxt.options as unknown as {
      i18n?: Record<string, unknown>;
      _layers?: Array<{ config: { i18n?: Record<string, unknown> } }>;
    };
    nuxtOptions.i18n = defu(nuxtOptions.i18n ?? {}, i18nConfig) as Record<
      string,
      unknown
    >;

    const rootLayer = nuxtOptions._layers?.[0];
    if (rootLayer) {
      rootLayer.config.i18n = defu(
        rootLayer.config.i18n ?? {},
        i18nConfig,
      ) as Record<string, unknown>;
    }

    await installModule("@nuxtjs/i18n");
  },
}) satisfies NuxtModule<MapoI18nOptions>;

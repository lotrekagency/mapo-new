import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  defineNuxtModule,
  addComponent,
  addLayout,
  addPlugin,
  addImports,
  addTypeTemplate,
  createResolver,
  extendPages,
  hasNuxtModule,
  installModule,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";

export interface MapoUikitOptions {
  /**
   * Path to a CSS file that is injected after the base uikit CSS.
   * Use it to override Tailwind theme tokens or add global styles.
   *
   * @example
   *  nuxt.config.ts
   * mapoUikit: { css: '~/assets/css/theme.css' }
   *
   *  assets/css/theme.css
   * @import "@nuxt/ui";
   * :root {
   *   --color-primary-500: oklch(0.7 0.2 240);
   * }
   */
  css?: string;

  /**
   * Default Nuxt UI component config merged into nuxt.options.ui.
   * Deep-merged so the consuming app can override individual keys.
   * @see https://ui.nuxt.com/getting-started/theme
   */
  ui?: Record<string, unknown>;

  /**
   * Media Manager configuration. Endpoints and upload limits are
   * forwarded to `runtimeConfig.public.mapoMedia` and read by `useMediaStore`.
   */
  media?: MapoMediaOptions;
}

export interface MapoMediaOptions {
  /**
   * REST endpoints used by the media store.
   * Defaults align with the Camomilla integration path-rewrites.
   */
  endpoints?: {
    /** Single-media CRUD (detail, update, delete, upload). Default `/api/media`. */
    media?: string;
    /** Folder navigation + CRUD. Default `/api/media-folders`. */
    folders?: string;
  };
  /** Max image upload size in MB. Default 10. */
  maxImageSize?: number;
  /** Max video upload size in MB. Default 100. */
  maxVideoSize?: number;
  /** Max size for any other file type in MB. Default 10. */
  maxDefaultSize?: number;
  /**
   * Django model used for media permission checks (`change_<model>`,
   * `delete_<model>`) in the editor. Default `"media"`.
   */
  permissionsModel?: string;
}

const MAPO_MEDIA_DEFAULTS = {
  endpoints: {
    media: "/api/media",
    folders: "/api/media-folders",
  },
  maxImageSize: 10,
  maxVideoSize: 100,
  maxDefaultSize: 10,
  permissionsModel: "media",
} satisfies Required<MapoMediaOptions>;

export default defineNuxtModule<MapoUikitOptions>({
  meta: {
    name: "@mapomodule/uikit",
    configKey: "mapoUikit",
  },

  defaults: {
    ui: {},
  },

  // @nuxt/ui must be declared BEFORE mapomodule in the consuming app's modules[]
  // so that @nuxt/icon's Icon component is available in SSR. Installing it via
  // installModule() from inside another module causes an SSR Icon infinite loop.
  moduleDependencies: {
    "@nuxt/ui": {},
  },

  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // UIKit components render every user-facing string through vue-i18n
    // (`useI18n().t("mapo...")`). @mapomodule/i18n provides the catalogs and
    // installs @nuxtjs/i18n unless the app manages it itself.
    if (!hasNuxtModule("@mapomodule/i18n")) {
      await installModule(await resolver.resolvePath("@mapomodule/i18n"));
    }

    addTypeTemplate({
      filename: "types/mapo-uikit-page-meta.d.ts",
      getContents: () =>
        readFileSync(
          resolver.resolve("./runtime/page-meta.nuxt.d.ts"),
          "utf-8",
        ),
    });

    // Base CSS: Tailwind v4 entry + Nuxt UI design tokens
    nuxt.options.css.unshift(resolver.resolve("./runtime/assets/main.css"));

    // Allow Vite to serve files from this package when consumed outside its workspace root
    nuxt.options.vite.server ??= {};
    nuxt.options.vite.server.fs ??= {};
    nuxt.options.vite.server.fs.allow ??= [];
    nuxt.options.vite.server.fs.allow.push(resolver.resolve("."));

    // Custom theme override CSS (injected after base so it wins)
    if (options.css) {
      nuxt.options.css.push(options.css);
    }

    // Merge module-level ui config into nuxt.options so consuming apps
    // can override Nuxt UI component defaults from the mapoUikit config key.
    if (options.ui && Object.keys(options.ui).length) {
      // @ts-expect-error — nuxt.options.ui typed by @nuxt/ui augmentation at app build time
      nuxt.options.ui = { ...options.ui, ...(nuxt.options.ui ?? {}) };
    }

    // Media config → runtimeConfig.public.mapoMedia (read by useMediaStore + uploader).
    // Only serializable values; the adapter functions go through the plugin below.
    const media = options.media ?? {};
    nuxt.options.runtimeConfig.public.mapoMedia = {
      endpoints: {
        media: media.endpoints?.media ?? MAPO_MEDIA_DEFAULTS.endpoints.media,
        folders:
          media.endpoints?.folders ?? MAPO_MEDIA_DEFAULTS.endpoints.folders,
      },
      maxImageSize: media.maxImageSize ?? MAPO_MEDIA_DEFAULTS.maxImageSize,
      maxVideoSize: media.maxVideoSize ?? MAPO_MEDIA_DEFAULTS.maxVideoSize,
      maxDefaultSize:
        media.maxDefaultSize ?? MAPO_MEDIA_DEFAULTS.maxDefaultSize,
      permissionsModel:
        media.permissionsModel ?? MAPO_MEDIA_DEFAULTS.permissionsModel,
    };

    const components = [
      // ─── Shell / Layout ───────────────────────────────────────────────────
      "MapoSnackBar",
      "MapoConfirmDialog",
      "MapoLogin",
      "MapoRootComponents",
      "MapoSidebar",
      "MapoSidebarList",
      "MapoSidebarListItem",
      "MapoLogoutButton",
      "MapoSidebarProfile",
      "MapoTopbar",
      "MapoLangSwitcher",
      "MapoThemeToggle",
      // ─── CRUD / Detail / List ─────────────────────────────────────────────
      "MapoDetail",
      "MapoDetailLangSwitch",
      "MapoList",
      "MapoListHead",
      "MapoListTabs",
      "MapoListFilters",
      "MapoListActions",
      "MapoListQuickEdit",
      "MapoListTable",
      // ─── Media ───────────────────────────────────────────────────────────
      "MapoDropArea",
      "MapoMediaBreadcrumbs",
      "MapoMediaFolders",
      "MapoMediaGallery",
      "MapoMediaFileChanger",
      "MapoMediaEditor",
      "MapoMediaUploader",
      "MapoMediaManager",
      "MapoMediaManagerDialog",
      // ─── Menu Manager ─────────────────────────────────────────────────────
      "MapoMenuTreeviewNode",
      "MapoMenuTreeview",
      "MapoMenuNodeEditor",
      "MapoMenuManager",
    ];

    for (const name of components) {
      addComponent({
        name,
        filePath: resolver.resolve(`./runtime/components/${name}.vue`),
      });
    }

    // Registered as `global` so they survive runtime lookup from *another*
    // package: the media fields in @mapomodule/form resolve the dialog by name
    // (see useMediaManager) and render the preview in their templates. Nuxt's
    // build-time auto-import only covers templates it scans, so a non-global
    // registration resolves to nothing once the caller lives outside uikit.
    for (const name of ["MapoMediaManagerDialog", "MapoMediaPreview"]) {
      addComponent({
        name,
        global: true,
        filePath: resolver.resolve(`./runtime/components/${name}.vue`),
      });
    }

    addLayout(
      { src: resolver.resolve("./runtime/layouts/default.vue") },
      "mapo-default",
    );
    addLayout(
      { src: resolver.resolve("./runtime/layouts/empty.vue") },
      "mapo-empty",
    );

    // Ensure @nuxt/icon bundles lucide icons regardless of hoisting detection.
    // Without this, in monorepo setups pnpm may hoist @iconify-json/lucide to the
    // workspace root and @nuxt/icon fails to detect it as a local package.
    nuxt.hook("modules:done", () => {
      // icon options are typed by @nuxt/icon's NuxtOptions augmentation at app build time.
      // Cast to any to avoid TS errors in the uikit package which doesn't depend on @nuxt/icon directly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iconOpts = nuxt.options as any;
      iconOpts.icon ??= {};
      iconOpts.icon.serverBundle ??= {};
      const existing: string[] = iconOpts.icon.serverBundle.collections ?? [];
      iconOpts.icon.serverBundle.collections = Array.from(
        new Set([...existing, "lucide"]),
      );
    });

    // NOTE: the `media` / `media-m2m` / `enhanced-media` field components live in
    // @mapomodule/form with every other field type and are registered in its
    // default registry. They resolve the picker dialog below at runtime.

    // Plugin: provide the default $mapoMediaAdapter. Integrations register their
    // own plugin ordered after this one to override request/response transforms.
    addPlugin({
      src: resolver.resolve("./runtime/plugins/media-adapter"),
      order: 5,
    });

    // Auto-import useMediaStore so consumers can use it without explicit imports
    addImports([
      {
        name: "useMediaStore",
        from: resolver.resolve("./runtime/stores/media"),
      },
    ]);

    // MapoOverride* system: if the consuming app has a `mapooverride/` directory
    // inside its srcDir, any .vue file named like a Mapo component will replace it
    // at build time. Convention: MapoTopbar.vue overrides MapoTopbar, etc.
    nuxt.hook("components:extend", (components) => {
      const overrideDir = resolve(nuxt.options.srcDir, "mapooverride");
      if (!existsSync(overrideDir)) return;
      for (const component of components) {
        // Component type from @nuxt/schema doesn't expose name/filePath/shortPath directly
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = component as any;
        const overridePath = resolve(overrideDir, `${c.name}.vue`);
        if (existsSync(overridePath)) {
          c.filePath = overridePath;
          c.shortPath = `mapooverride/${c.name}.vue`;
        }
      }
    });

    extendPages((pages) => {
      // Add a catch-all route for the login page that renders the MapoLogin component.
      // This allows the login page to be rendered without requiring the consuming app
      // to create its own login page and route.
      if (!pages.some((p) => p.path === "/login"))
        pages.push({
          name: "mapo-login",
          path: "/login",
          file: resolver.resolve("./runtime/pages/login.vue"),
          meta: { layout: "mapo-empty" },
        });

      if (!pages.some((p) => p.path === "/"))
        pages.push({
          name: "mapo-index",
          path: "/",
          file: resolver.resolve("./runtime/pages/index.vue"),
          meta: { layout: "mapo-default" },
        });
    });
  },
}) satisfies NuxtModule<MapoUikitOptions>;

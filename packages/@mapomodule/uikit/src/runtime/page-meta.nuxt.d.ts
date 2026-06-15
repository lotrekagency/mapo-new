declare module "#app" {
  interface PageMeta {
    /** Human-readable label shown in sidebar/navigation. Pages without a label are excluded from the menu. */
    label?: string;
    /** Icon name used in sidebar/navigation (e.g. 'i-lucide-user-check'). */
    icon?: string;
    /** Hide this page from automatic sidebar/navigation generation even if it has a label. */
    hidden?: boolean;
    /** Path of the parent route for nested menu grouping. */
    parent?: string;
    /** Pin this page to the sidebar footer instead of the main navigation list. */
    sidebarFooter?: boolean;
  }
}

declare module "vue-router" {
  /**
   * Route meta extension mirrored from Nuxt `PageMeta` so runtime route records
   * keep the same navigation-related fields after compilation.
   */
  interface RouteMeta {
    /** Human-readable label shown in sidebar/navigation. */
    label?: string;
    /** Icon name used in sidebar/navigation (e.g. 'i-lucide-user-check'). */
    icon?: string;
    /** Hide this page from automatic sidebar/navigation generation. */
    hidden?: boolean;
    /** Path of the parent route for nested menu grouping. */
    parent?: string;
    /** Pin this page to the sidebar footer instead of the main navigation list. */
    sidebarFooter?: boolean;
  }
}

declare global {
  /**
   * Nuxt compile-time macro used in page SFCs to define route metadata.
   *
   * This declaration provides package-local type support when Nuxt-generated
   * `#imports` types are not available to the TypeScript language service.
   */
  const definePageMeta: (meta: import("#app").PageMeta) => void;
}

export {};

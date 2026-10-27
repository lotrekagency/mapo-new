declare module "vue-router" {
  interface RouteMeta {
    label?: string;
    icon?: string;
    hidden?: boolean;
    parent?: string;
    sidebarFooter?: boolean;
    sidebarOrder?: number;
  }
}

export {};

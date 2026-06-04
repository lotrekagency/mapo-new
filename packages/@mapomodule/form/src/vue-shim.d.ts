declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

// Asset imports resolved by the bundler (Vite/Nuxt) at build time, not by TS.
declare module "*.css";
declare module "*.png?url" {
  const url: string;
  export default url;
}

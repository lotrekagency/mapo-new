/**
 * Path rewrite rules where key is a regex pattern string and value is the
 * replacement path applied by the proxy middleware.
 */
export interface CamomillaPathRewrite {
  [pattern: string]: string;
}

export interface CamomillaOptions {
  /** URL of the Camomilla CMS backend, e.g. "http://localhost:8000" */
  server: string;
  /** API base prefix used by the Nuxt app, e.g. "" or "myapp". Defaults to "". */
  base?: string;
  /** When true, a login on Django admin also logs in Mapo and vice-versa (shared sessionid). */
  syncCamomillaSession?: boolean;
  /** Extra request headers to forward to the Camomilla server. */
  forwardedHeaders?: string[];
  /** Custom path rewrites merged after the built-in ones. Key = regex string, value = replacement. */
  pathRewrite?: CamomillaPathRewrite;
  /**
   * Register the Camomilla media adapter ($mapoMediaAdapter) that maps the
   * Media Manager's canonical params to Camomilla's dialect (mime → `fltr`,
   * `language_code`). Defaults to true. Set false to keep the default REST adapter.
   */
  mediaAdapter?: boolean;
}

/** Shape stored in runtimeConfig (private, server-only). `mediaAdapter` is build-time only. */
export type CamomillaRuntimeConfig = Required<
  Omit<CamomillaOptions, "mediaAdapter">
>;

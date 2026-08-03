/**
 * Public types for `@mapomodule/mcp`.
 * Import from `@mapomodule/mcp/types`.
 */

export interface MapoMcpBackendOptions {
  /**
   * OpenAPI/DRF schema URL used by `mapo_backend_schema`
   * (e.g. `http://localhost:8000/api/schema/?format=json`).
   * Falls back to `MAPO_BACKEND_SCHEMA_URL`.
   */
  schemaUrl?: string;
  /**
   * Name of the environment variable holding the bearer token for the schema
   * request. The value is never echoed back to the MCP client.
   * @default "MAPO_BACKEND_TOKEN"
   */
  tokenEnv?: string;
}

export interface MapoMcpOptions {
  /**
   * Register the MCP server. Defaults to `nuxt.options.dev` — the server is a
   * development tool and never ships in a production build unless forced.
   */
  enabled?: boolean;
  backend?: MapoMcpBackendOptions;
}

/** Field type registered in the form registry, as seen at build time. */
export interface MapoManifestFieldType {
  type: string;
  source: "default" | "config";
}

/** Build-time snapshot of the consuming app, exposed by `mapo_inspect_app`. */
export interface MapoAppManifest {
  /** Absolute path of the app root (dev machine). */
  rootDir: string;
  dev: boolean;
  /** Installed `@mapomodule/*` modules and their versions. */
  modules: Array<{ name: string; version?: string }>;
  /**
   * `modules[]` as written in `nuxt.config`, in order. Only string entries are
   * reported — inline function modules have no stable name. Ordering matters:
   * `@nuxt/ui` must come before `mapomodule`.
   */
  moduleOrder: string[];
  /** Public Mapo runtime config; secret values are replaced by their key names. */
  config: Record<string, unknown>;
  fieldTypes: MapoManifestFieldType[];
  components: string[];
  routes: Array<{ path: string; file?: string }>;
  locales: string[];
}

/** Payload of the `#mapo-mcp/context.mjs` virtual server module. */
export interface MapoMcpContext {
  /** Absolute path of the generated knowledge base, or `null` when not built. */
  knowledgeDir: string | null;
  backend: Required<Pick<MapoMcpBackendOptions, "tokenEnv">> & {
    schemaUrl: string | null;
  };
  manifest: MapoAppManifest;
}

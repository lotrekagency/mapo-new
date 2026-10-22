/**
 * Where the Mapo MCP handler answers.
 *
 * `@nuxtjs/mcp-toolkit` mounts named handlers at `/mcp/<name>` whatever its
 * `mcp.route` option says, and Nitro serves every server route under the app's
 * `app.baseURL`. An app served under `/backoffice/` therefore answers at
 * `/backoffice/mcp/mapo`, and a request to `/mcp/mapo` misses it: the dev
 * server answers with a redirect, which MCP clients follow as a GET.
 */

/**
 * Directory name under `runtime/mcp/handlers/`, which the toolkit turns into
 * the handler name and the route segment. It is not configurable: folder
 * handlers always take their name from the directory.
 */
export const MCP_HANDLER_NAME = "mapo";

/** Path of the handler under an `app.baseURL` such as `/`, `/backoffice/` or `./`. */
export function mcpEndpointPath(baseURL = "/"): string {
  const base = `/${baseURL.replace(/^\.?\/+/, "")}`.replace(/\/*$/, "/");
  return `${base}mcp/${MCP_HANDLER_NAME}`;
}

/** Full URL of the handler on an origin such as `http://localhost:3000`. */
export function mcpEndpointUrl(origin: string, baseURL = "/"): string {
  return `${origin.replace(/\/+$/, "")}${mcpEndpointPath(baseURL)}`;
}

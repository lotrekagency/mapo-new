/**
 * Ensures an API endpoint path has exactly one leading and one trailing slash.
 * Query strings are preserved unchanged — the slash is inserted before the `?`.
 * Used by `useCrud` to normalize user-provided endpoint paths before making requests.
 *
 * @example
 * normalizeEndpoint('api/articles')          // '/api/articles/'
 * normalizeEndpoint('/api/articles')         // '/api/articles/'
 * normalizeEndpoint('/api/articles/')        // '/api/articles/'
 * normalizeEndpoint('/api/articles/?q=1')    // '/api/articles/?q=1'
 */
export function normalizeEndpoint(endpoint: string): string {
  const qIdx = endpoint.indexOf("?");
  const path = qIdx >= 0 ? endpoint.slice(0, qIdx) : endpoint;
  const query = qIdx >= 0 ? endpoint.slice(qIdx) : "";
  const stripped = path.replace(/^\/+|\/+$/g, "");
  return `/${stripped}/${query}`;
}

/**
 * Splits an endpoint string into its clean path and parsed query params.
 * Useful when an endpoint carries baked-in params (e.g. `?fields=id,title`) that
 * must be merged into request params while CRUD mutations target the bare path.
 *
 * @example
 * splitEndpointParams('/api/articles/?fields=id,title')
 *  { path: '/api/articles/', params: { fields: 'id,title' } }
 * splitEndpointParams('/api/articles/')
 *  { path: '/api/articles/', params: {} }
 */
export function splitEndpointParams(endpoint: string): {
  path: string;
  params: Record<string, string>;
} {
  const qIdx = endpoint.indexOf("?");
  if (qIdx < 0) return { path: endpoint, params: {} };
  return {
    path: endpoint.slice(0, qIdx),
    params: Object.fromEntries(new URLSearchParams(endpoint.slice(qIdx + 1))),
  };
}

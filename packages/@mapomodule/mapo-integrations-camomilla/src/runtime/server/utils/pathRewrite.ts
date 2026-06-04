import type { CamomillaPathRewrite } from "../../../types";
import {
  CAMOMILLA_AUTH_LOGIN_PATH,
  CAMOMILLA_AUTH_LOGOUT_PATH,
  CAMOMILLA_MEDIA_FOLDERS_PATH,
  CAMOMILLA_MEDIA_PATH,
  CAMOMILLA_USER_CURRENT_PATH,
  MAPO_AUTH_LOGIN_PATH,
  MAPO_AUTH_LOGOUT_PATH,
  MAPO_USER_INFO_PATH,
} from "../../constants";

/**
 * Builds built-in API rewrite rules used by the Camomilla proxy.
 *
 * @param base Optional app base path prefix.
 * @returns Default regex rewrite map applied before custom overrides.
 */
export function buildDefaultRewrites(base: string): CamomillaPathRewrite {
  const b = base
    ? (base.startsWith("/") ? base : "/" + base).replace(/\/+$/, "")
    : "";
  return {
    [`^${b}${MAPO_AUTH_LOGIN_PATH}`]: CAMOMILLA_AUTH_LOGIN_PATH,
    [`^${b}${MAPO_AUTH_LOGOUT_PATH}`]: CAMOMILLA_AUTH_LOGOUT_PATH,
    [`^${b}${MAPO_USER_INFO_PATH}`]: CAMOMILLA_USER_CURRENT_PATH,
    // media-folders before media to avoid greedy match
    [`^${b}/api/media-folders`]: CAMOMILLA_MEDIA_FOLDERS_PATH,
    [`^${b}/api/media`]: CAMOMILLA_MEDIA_PATH,
    [`^${b}/api`]: "/api",
  };
}

/**
 * Rewrites a request pathname according to default and user-defined rules.
 *
 * Custom rewrites take precedence over built-in rewrites. The output path is
 * normalized to avoid accidental duplicated slashes.
 *
 * @param pathname Incoming request pathname.
 * @param base Optional app base path prefix.
 * @param customRewrites User-provided rewrite map.
 * @returns Rewritten path (or original path when no rule matches).
 */
export function applyPathRewrite(
  pathname: string,
  base: string,
  customRewrites: CamomillaPathRewrite,
): string {
  const rewrites = { ...buildDefaultRewrites(base), ...customRewrites };
  for (const [pattern, replacement] of Object.entries(rewrites)) {
    const regex = new RegExp(pattern);
    if (regex.test(pathname)) {
      const rewritten = pathname.replace(regex, replacement);
      // Collapse any accidental double slashes introduced by replacements
      // that end with '/' applied to a path with a trailing '/'.
      return rewritten.replace(/([^:]\/)\/+/g, "$1");
    }
  }
  return pathname;
}

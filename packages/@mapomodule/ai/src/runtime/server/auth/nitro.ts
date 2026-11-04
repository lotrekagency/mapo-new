/**
 * The gateway's authentication wired to the app's Nitro server. Every route
 * starts here: the request's cookie goes to `userInfoApi` through Nitro's
 * local fetch, the way core restores the session when it renders a page, so
 * the app's own proxy to the backend sees the call; then the rules of
 * `mapo.ai.admin` and `mapo.ai.users`, then the app's `mapo-ai:user` hooks.
 * The logic lives in `session.ts` and `user.ts`, which the tests run
 * without Nitro.
 */

import { createError, getRequestHeader } from "h3";
import type { H3Event } from "h3";
import { useNitroApp, useRuntimeConfig } from "nitropack/runtime";
import { MAPO_AI_GATEWAY_PATH } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { createSessionCache } from "./session";
import type { BackendAnswer } from "./session";
import { canOnModel, isAiAdmin, mayUseAi, readAccessRule } from "./user";
import type {
  MapoAiAccessRules,
  MapoAiModelAction,
  MapoAiUser,
  MapoAiUserContext,
} from "./user";

/** The caller of a gateway route: who they are, and whether they administer the AI. */
export interface MapoAiSession {
  user: MapoAiUser;
  admin: boolean;
}

/**
 * Who calls the gateway, and whether the app's rules let them use it. A
 * user the rules refuse administers nothing.
 */
export interface MapoAiCaller extends MapoAiSession {
  /** Whether `mapo.ai.users` and the `mapo-ai:user` hooks let the user in. */
  allowed: boolean;
}

/** Core's default, for an app that does not set `mapo.userInfoApi`. */
const DEFAULT_USER_INFO_API = "/api/profiles/me/";

/** Methods that change nothing: a browser may send them from anywhere. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const sessions = createSessionCache();
const warnedRules = new Set<string>();

/**
 * Who calls the gateway, for a route that answers a refused user instead
 * of refusing them, as `status` does. Fails, as every route does:
 * - 401 without a session: no cookie, or the backend refuses it;
 * - 403 when a browser sends a request that changes something from another
 *   site;
 * - 502 when the backend cannot say who is signed in: it is down, or
 *   `userInfoApi` returns no user. The browser is not sent to the login
 *   page for that, and the server's log says why.
 * @throws H3Error 401, 403 or 502
 */
export async function readMapoAiCaller(event: H3Event): Promise<MapoAiCaller> {
  refuseCrossSite(event);
  const outcome = await sessions.resolve(
    getRequestHeader(event, "cookie"),
    (cookie) => askUserInfo(event, cookie),
  );
  if (outcome.status === "anonymous") {
    throw createError({ statusCode: 401, statusMessage: "Not signed in" });
  }
  if (outcome.status === "unavailable") {
    console.error(
      `[mapo-ai] The gateway cannot tell who is signed in: ${outcome.reason}.`,
    );
    throw createError({
      statusCode: 502,
      statusMessage: "Backend session unavailable",
    });
  }

  const { user, payload } = outcome;
  const rules = accessRules(event);
  const admin = isAiAdmin(user, rules);
  if (!mayUseAi(user, rules)) return { user, admin: false, allowed: false };
  const allowed = await askHooks({ event, user, payload, admin });
  return { user, admin: allowed && admin, allowed };
}

/**
 * The caller of a gateway route that acts, or the error that refuses them:
 * as {@link readMapoAiCaller}, and 403 when `mapo.ai.users` or a
 * `mapo-ai:user` hook refuses the user.
 * @throws H3Error 401, 403 or 502
 */
export async function requireMapoAiSession(
  event: H3Event,
): Promise<MapoAiSession> {
  const caller = await readMapoAiCaller(event);
  if (!caller.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: "Not allowed to use the AI",
    });
  }
  return { user: caller.user, admin: caller.admin };
}

/**
 * The caller of an admin route: as {@link requireMapoAiSession}, and 403
 * for a user `mapo.ai.admin` does not pick (superusers always pass).
 * @throws H3Error 401, 403 or 502
 */
export async function requireMapoAiAdmin(
  event: H3Event,
): Promise<MapoAiSession> {
  const session = await requireMapoAiSession(event);
  if (!session.admin) {
    throw createError({ statusCode: 403, statusMessage: "Not an AI admin" });
  }
  return session;
}

/**
 * Refuses a call on a record of `model` the user may not fill: `add_` for
 * a new record, `change_` for an existing one. Without a model, as for a
 * page that declares none, there is nothing to check.
 * @throws H3Error 403
 */
export function requireModelPermission(
  session: MapoAiSession,
  model: string | undefined,
  action: MapoAiModelAction,
): void {
  if (model === undefined) return;
  if (!canOnModel(session.user, model, action)) {
    throw createError({
      statusCode: 403,
      statusMessage: "No permission on this model",
    });
  }
}

/**
 * Runs the app's `mapo-ai:user` hooks. `allowed` only goes one way: once a
 * hook refuses the user, no later hook can let them back in, so the rules
 * of two plugins that each refuse some users both hold.
 */
async function askHooks(
  facts: Omit<MapoAiUserContext, "allowed">,
): Promise<boolean> {
  let allowed = true;
  const context: MapoAiUserContext = {
    ...facts,
    get allowed() {
      return allowed;
    },
    set allowed(value: boolean) {
      if (value !== true) allowed = false;
    },
  };
  await useNitroApp().hooks.callHook("mapo-ai:user", context);
  return allowed;
}

/**
 * A browser marks every request with where it comes from. One that changes
 * something must come from the app's own pages: the cookie of a session
 * would otherwise let another site spend the user's AI. A client that
 * sends no mark is no browser, an old one, or one on a page served over
 * plain HTTP (browsers mark requests to HTTPS and localhost only), and the
 * session cookie's `SameSite` still applies.
 */
function refuseCrossSite(event: H3Event): void {
  if (SAFE_METHODS.has(event.method)) return;
  const site = getRequestHeader(event, "sec-fetch-site");
  const isMarked = site !== undefined;
  const isSameOrigin = site === "same-origin";
  if (isMarked && !isSameOrigin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Cross-site request refused",
    });
  }
}

/**
 * Asks `userInfoApi` with the request's cookie, and only that. A
 * `userInfoApi` among the gateway's own routes would make every request
 * call itself without end, so it is refused.
 */
async function askUserInfo(
  event: H3Event,
  cookie: string,
): Promise<BackendAnswer> {
  const config: unknown = useRuntimeConfig(event);
  const base = appBaseURL(config);
  const url = withAppBase(base, userInfoApiOf(config));
  const gateway = withAppBase(base, MAPO_AI_GATEWAY_PATH);
  const isGatewayRoute = url === gateway || url.startsWith(`${gateway}/`);
  if (isGatewayRoute) {
    throw new Error(`it is ${url}, a route of the AI gateway itself`);
  }
  const response = await useNitroApp().localFetch(url, {
    headers: { cookie, accept: "application/json" },
  });
  return { status: response.status, body: await jsonOf(response) };
}

/** The rules of `mapo.ai.admin` and `mapo.ai.users`; one that cannot be read grants nothing. */
function accessRules(event: H3Event): MapoAiAccessRules {
  const config: unknown = useRuntimeConfig(event).mapoAi;
  const options = isRecord(config) ? config : {};
  const admin = readAccessRule(options.admin);
  const users = readAccessRule(options.users);
  if (admin === "invalid") warnRule("admin", "superusers");
  if (users === "invalid") warnRule("users", "superusers and the AI's admins");
  const isAdminReadable = admin !== undefined && admin !== "invalid";
  return {
    admin: isAdminReadable ? admin : {},
    users: users === "invalid" ? {} : users,
  };
}

/** One line in the log per unreadable rule in a run, however often it is read. */
function warnRule(name: "admin" | "users", left: string): void {
  if (warnedRules.has(name)) return;
  warnedRules.add(name);
  console.error(
    `[mapo-ai] mapo.ai.${name} in the runtime config is not { groups?: string[], permissions?: string[] }: the gateway reads it as no group and no permission, so it picks ${left} only.`,
  );
}

function userInfoApiOf(config: unknown): string {
  const publicConfig = isRecord(config) ? config.public : undefined;
  const core = isRecord(publicConfig) ? publicConfig.mapoCore : undefined;
  const value = isRecord(core) ? core.userInfoApi : undefined;
  const isSet = typeof value === "string" && value.trim() !== "";
  return isSet ? value : DEFAULT_USER_INFO_API;
}

function appBaseURL(config: unknown): string {
  const app = isRecord(config) ? config.app : undefined;
  const value = isRecord(app) ? app.baseURL : undefined;
  return typeof value === "string" ? value : "/";
}

/**
 * `path` under the app's `baseURL`, where Nitro serves it, as Nitro's
 * `$fetch` puts it there for core's session restore. A URL with a protocol
 * goes out as it is, to the backend it names.
 */
export function withAppBase(base: string, path: string): string {
  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(path);
  if (hasProtocol) return path;
  const absolute = `/${path.replace(/^\/+/, "")}`;
  const prefix = base.replace(/\/+$/, "");
  const isUnderBase = absolute === prefix || absolute.startsWith(`${prefix}/`);
  if (prefix === "" || isUnderBase) return absolute;
  return `${prefix}${absolute}`;
}

/** The body as JSON, or `undefined` when it is not. */
async function jsonOf(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

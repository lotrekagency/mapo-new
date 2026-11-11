import type { H3Event } from "h3";
import { createError, deleteCookie, getCookie, readBody, setCookie } from "h3";

const SESSION_COOKIE = "__mapo_session";

/** A user as the backend's `userInfoApi` answers it. */
interface MockUser {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  /**
   * A field of this backend the gateway does not read: an account of
   * someone outside the company, such as a contractor. The app's
   * `mapo-ai:user` hook reads it from the payload and keeps them out of the
   * AI (server/plugins/mapo-ai-rules.ts).
   */
  is_external: boolean;
  all_permissions: string[];
  user_permissions: string[];
  groups: string[];
}

// The accounts, password equal to the username. The groups give the AI's
// admins something to assign keys to, and `mapo.ai.users` in nuxt.config.ts
// lets only the groups "editors" and "reporters" use the AI (superusers
// always may); the permissions decide who adds, changes and deletes the
// articles, the pages and the events (server/api/articles, server/api/pages,
// server/api/events), and so who gets Magic Fill on them:
// admin      → superuser, so an admin of the AI; group "admin"
// editor     → group "editors"; every action on articles, pages and events
// writer     → groups "editors" and "reporters": a key assigned to both goes
//              by the order the admins give the groups; adds and changes
//              articles, pages and events
// viewer     → no group; reads articles, pages and events only, so no Magic
//              Fill, and no group `mapo.ai.users` names: `status` answers it
//              `allowed: false`
// contractor → group "editors", adds and changes articles, pages and events
//              as writer does, but the backend marks the account external,
//              and the app's `mapo-ai:user` hook keeps it out of the AI:
//              Save works, Magic Fill does not show
const MOCK_USERS: Record<string, MockUser> = {
  admin: account(1, "admin", ["admin"], [], { superuser: true }),
  editor: account(
    2,
    "editor",
    ["editors"],
    can(["view", "add", "change", "delete"]),
  ),
  writer: account(
    3,
    "writer",
    ["editors", "reporters"],
    can(["view", "add", "change"]),
  ),
  viewer: account(4, "viewer", [], can(["view"])),
  contractor: account(
    5,
    "contractor",
    ["editors"],
    can(["view", "add", "change"]),
    { external: true },
  ),
};

/** The codenames of `actions` on the app's three models. */
function can(actions: string[]): string[] {
  const models = ["article", "page", "event"];
  return models.flatMap((model) =>
    actions.map((action) => `${action}_${model}`),
  );
}

function account(
  id: number,
  username: string,
  groups: string[],
  permissions: string[],
  { superuser = false, external = false } = {},
): MockUser {
  return {
    id,
    username,
    email: `${username}@example.com`,
    is_superuser: superuser,
    is_external: external,
    all_permissions: permissions,
    user_permissions: permissions,
    groups,
  };
}

export async function login(event: H3Event) {
  const body = await readBody<{ username?: string; password?: string }>(event);
  const username = body?.username ?? "";
  const user = MOCK_USERS[username];
  if (!user || body?.password !== username) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid credentials",
    });
  }
  setCookie(event, SESSION_COOKIE, username, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return user;
}

export function logout(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: "/" });
}

export function requireUser(event: H3Event): MockUser {
  const username = getCookie(event, SESSION_COOKIE);
  const user = username ? MOCK_USERS[username] : undefined;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return user;
}

/** The users as a DRF backend lists them: id, username, email; by `search`. */
export function listUsers(search = "") {
  const query = search.toLowerCase();
  return Object.values(MOCK_USERS)
    .map(({ id, username, email }) => ({ id, username, email }))
    .filter(
      (user) =>
        !query || user.username.includes(query) || user.email.includes(query),
    );
}

/** A user with this id exists: an event's contact is one of them. */
export function isUser(id: number): boolean {
  return Object.values(MOCK_USERS).some((user) => user.id === id);
}

/** The groups of the accounts as a DRF backend lists them: id, name; by `search`. */
export function listGroups(search = "") {
  const query = search.toLowerCase();
  const names = new Set(
    Object.values(MOCK_USERS).flatMap((user) => user.groups),
  );
  return [...names]
    .sort()
    .map((name, index) => ({ id: index + 1, name }))
    .filter((group) => !query || group.name.includes(query));
}

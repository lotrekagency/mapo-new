import type { H3Event } from "h3";
import { createError, deleteCookie, getCookie, readBody, setCookie } from "h3";

const SESSION_COOKIE = "__mapo_session";

/** A user as the backend's `userInfoApi` answers it. */
interface MockUser {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  all_permissions: string[];
  user_permissions: string[];
  groups: string[];
}

// The accounts, password equal to the username. The groups give the AI's
// admins something to assign keys to; the permissions decide who adds,
// changes and deletes the articles and the pages (server/api/articles,
// server/api/pages), and so who gets Magic Fill on them:
// admin   → superuser, so an admin of the AI; group "admin"
// editor  → group "editors"; every action on articles and pages
// writer  → groups "editors" and "reporters": a key assigned to both goes
//           by the order the admins give the groups; adds and changes
//           articles and pages
// viewer  → no group; reads articles and pages only, so no Magic Fill
const MOCK_USERS: Record<string, MockUser> = {
  admin: account(1, "admin", ["admin"], [], true),
  editor: account(
    2,
    "editor",
    ["editors"],
    [
      "view_article",
      "add_article",
      "change_article",
      "delete_article",
      "view_page",
      "add_page",
      "change_page",
      "delete_page",
    ],
  ),
  writer: account(
    3,
    "writer",
    ["editors", "reporters"],
    [
      "view_article",
      "add_article",
      "change_article",
      "view_page",
      "add_page",
      "change_page",
    ],
  ),
  viewer: account(4, "viewer", [], ["view_article", "view_page"]),
};

function account(
  id: number,
  username: string,
  groups: string[],
  permissions: string[],
  superuser = false,
): MockUser {
  return {
    id,
    username,
    email: `${username}@example.com`,
    is_superuser: superuser,
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

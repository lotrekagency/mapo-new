import type { H3Event } from "h3";
import { getCookie, setCookie, deleteCookie, createError, readBody } from "h3";

const SESSION_COOKIE = "__mapo_session";

// Mock users for E2E testing — password equals username for all accounts.
// admin   → superuser, all permissions, groups: ['admin']
// editor  → staff, article CRUD + view_user, groups: ['editors']
// viewer  → read-only (view_article only), no groups
const MOCK_USERS: Record<string, object> = {
  admin: {
    id: 1,
    username: "admin",
    email: "admin@example.com",
    is_superuser: true,
    all_permissions: [
      "view_article",
      "add_article",
      "change_article",
      "delete_article",
      "view_user",
      "add_user",
      "change_user",
      "delete_user",
    ],
    user_permissions: [],
    groups: ["admin"],
  },
  editor: {
    id: 2,
    username: "editor",
    email: "editor@example.com",
    is_superuser: false,
    all_permissions: [
      "view_article",
      "add_article",
      "change_article",
      "view_user",
    ],
    user_permissions: [
      "view_article",
      "add_article",
      "change_article",
      "view_user",
    ],
    groups: ["editors"],
  },
  viewer: {
    id: 3,
    username: "viewer",
    email: "viewer@example.com",
    is_superuser: false,
    all_permissions: ["view_article"],
    user_permissions: ["view_article"],
    groups: [],
  },
};

export async function login(event: H3Event) {
  const body = await readBody<{ username?: string; password?: string }>(event);
  const username = body?.username ?? "";
  const password = body?.password ?? "";

  // Password is the same as the username (e.g. admin/admin, editor/editor).
  const user = MOCK_USERS[username];
  if (!user || username !== password) {
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

export function requireUser(event: H3Event) {
  const username = getCookie(event, SESSION_COOKIE);
  const user = username ? MOCK_USERS[username] : null;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return user;
}

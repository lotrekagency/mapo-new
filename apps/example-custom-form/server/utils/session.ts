import type { H3Event } from "h3";
import { getCookie, setCookie, deleteCookie, createError } from "h3";

const COOKIE = "mapo_mock_session";

export interface MockUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
}

const DEFAULT_USER: MockUser = {
  id: 1,
  username: "admin",
  email: "admin@example.com",
  is_staff: true,
  is_superuser: true,
};

export function login(event: H3Event): MockUser {
  setCookie(event, COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return DEFAULT_USER;
}

export function logout(event: H3Event): void {
  deleteCookie(event, COOKIE, { path: "/" });
}

export function requireUser(event: H3Event): MockUser {
  if (!getCookie(event, COOKIE)) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return DEFAULT_USER;
}

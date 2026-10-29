import { describe, it, expect, vi, beforeEach } from "vitest";

// --- nuxt/app is a virtual runtime module; stub the handful of helpers used. ---
const cookieRef = { value: "a-session-value" as string | null };
const djangoCookieRef = { value: null as string | null };
const requestHeaders = { cookie: "__mapo_session=a-session-value" };
const runtimeConfig = { public: { mapoCore: {} as Record<string, unknown> } };

vi.mock("nuxt/app", () => ({
  defineNuxtPlugin: (p: unknown) => p,
  useRuntimeConfig: () => runtimeConfig,
  useCookie: (name: string) =>
    name === "sessionid" ? djangoCookieRef : cookieRef,
  useRequestHeaders: () => requestHeaders,
}));

vi.mock("pinia", () => ({ setActivePinia: vi.fn() }));

const authStore = { setUser: vi.fn(), reset: vi.fn() };
vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => authStore,
}));
vi.mock("@mapomodule/store/runtime/stores/sidebar", () => ({
  useSidebarStore: () => ({ hydrateFromCookies: vi.fn() }),
}));

// Imported after the mocks (vitest hoists them).
import plugin from "../../plugins/01.init.server";

function run($mapoFetch: unknown) {
  return (
    plugin as unknown as {
      setup: (app: Record<string, unknown>) => Promise<void>;
    }
  ).setup({ $pinia: {}, $mapoFetch });
}

describe("mapo-core:init (SSR session restore)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieRef.value = "a-session-value";
    djangoCookieRef.value = null;
    requestHeaders.cookie = "__mapo_session=a-session-value";
    runtimeConfig.public.mapoCore = {};
  });

  // The bug this guards: building `${protocol}//${host}${userInfoApi}` dropped
  // `app.baseURL` (404 under /backoffice/) and aimed at the browser-facing host,
  // which the SSR container cannot resolve — so every hard refresh logged the user out.
  it("fetches the user with a RELATIVE url so app.baseURL applies", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ username: "root" }));
    await run(fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/profiles/me/");
    expect(url).not.toMatch(/^https?:\/\//);
    expect(authStore.setUser).toHaveBeenCalledWith({ username: "root" });
  });

  it("honours a configured userInfoApi, still relative", async () => {
    runtimeConfig.public.mapoCore = { userInfoApi: "/api/whoami/" };
    const fetchMock = vi.fn(() => Promise.resolve({ username: "root" }));
    await run(fetchMock);

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/whoami/");
  });

  it("restores a shared Django session without a Mapo copy", async () => {
    cookieRef.value = null;
    djangoCookieRef.value = "live-django-session";
    requestHeaders.cookie = "sessionid=live-django-session; csrftoken=csrf";
    const fetchMock = vi.fn().mockResolvedValue({ username: "site-user" });

    await run(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/profiles/me/", {
      method: "GET",
      headers: requestHeaders,
    });
    expect(authStore.setUser).toHaveBeenCalledWith({ username: "site-user" });
    expect(djangoCookieRef.value).toBe("live-django-session");
  });

  it("forwards both cookies unchanged so the integration decides precedence", async () => {
    djangoCookieRef.value = "new-django-session";
    requestHeaders.cookie =
      "sessionid=new-django-session; __mapo_session=a-session-value";
    const fetchMock = vi.fn().mockResolvedValue({ username: "current-user" });

    await run(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/profiles/me/", {
      method: "GET",
      headers: requestHeaders,
    });
    expect(authStore.setUser).toHaveBeenCalledWith({
      username: "current-user",
    });
  });

  it.each([401, 403])(
    "clears only the Mapo copy on rejection (%i)",
    async (status) => {
      djangoCookieRef.value = "shared-session";
      const fetchMock = vi.fn(() =>
        Promise.reject(Object.assign(new Error("Rejected"), { status })),
      );
      await run(fetchMock);

      expect(authStore.reset).toHaveBeenCalled();
      expect(cookieRef.value).toBeNull();
      expect(djangoCookieRef.value).toBe("shared-session");
    },
  );

  // A transport failure must not log the user out: the cookie is HttpOnly, so
  // clearing it here is irreversible for the client.
  it("keeps the session cookie when the backend is unreachable", async () => {
    djangoCookieRef.value = "shared-session";
    const fetchMock = vi.fn(() =>
      Promise.reject(Object.assign(new Error("Bad Gateway"), { status: 502 })),
    );
    await run(fetchMock);

    expect(authStore.reset).toHaveBeenCalled();
    expect(cookieRef.value).toBe("a-session-value");
    expect(djangoCookieRef.value).toBe("shared-session");
  });

  it("does nothing when there is no session cookie", async () => {
    cookieRef.value = null;
    const fetchMock = vi.fn();
    await run(fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

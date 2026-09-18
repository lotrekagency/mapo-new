import { describe, it, expect, vi, beforeEach } from "vitest";

// --- nuxt/app is a virtual runtime module; stub the handful of helpers used. ---
const cookieRef = { value: "a-session-value" as string | null };
const runtimeConfig = { public: { mapoCore: {} as Record<string, unknown> } };

vi.mock("nuxt/app", () => ({
  defineNuxtPlugin: (p: unknown) => p,
  useRuntimeConfig: () => runtimeConfig,
  useCookie: () => cookieRef,
  useRequestHeaders: () => ({ cookie: "__mapo_session=a-session-value" }),
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

  it("clears the session cookie when the backend rejects it (401)", async () => {
    const fetchMock = vi.fn(() =>
      Promise.reject(Object.assign(new Error("Unauthorized"), { status: 401 })),
    );
    await run(fetchMock);

    expect(authStore.reset).toHaveBeenCalled();
    expect(cookieRef.value).toBeNull();
  });

  // A transport failure must not log the user out: the cookie is HttpOnly, so
  // clearing it here is irreversible for the client.
  it("keeps the session cookie when the backend is unreachable", async () => {
    const fetchMock = vi.fn(() =>
      Promise.reject(Object.assign(new Error("Bad Gateway"), { status: 502 })),
    );
    await run(fetchMock);

    expect(authStore.reset).toHaveBeenCalled();
    expect(cookieRef.value).toBe("a-session-value");
  });

  it("does nothing when there is no session cookie", async () => {
    cookieRef.value = null;
    const fetchMock = vi.fn();
    await run(fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

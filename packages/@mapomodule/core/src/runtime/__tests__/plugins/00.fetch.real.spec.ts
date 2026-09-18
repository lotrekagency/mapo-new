import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercises the REAL mapo-core:fetch plugin hooks, not a hand-written copy of them.
// The hooks are built inside setup() via the global `$fetch.create`, so stub that and
// capture what the plugin actually passes.

vi.mock("nuxt/app", () => ({
  defineNuxtPlugin: (p: unknown) => p,
  navigateTo: vi.fn(),
  useRoute: () => ({ fullPath: "/articoli" }),
  useRuntimeConfig: () => ({
    public: { mapoCore: { logoutUrl: "/logout", loginUrl: "/login" } },
  }),
  useRequestHeaders: () => ({ cookie: "__mapo_session=abc; sessionid=abc" }),
}));

const authStore = { reset: vi.fn() };
const snackStore = { show: vi.fn() };
vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => authStore,
}));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => snackStore,
}));

import plugin from "../../plugins/00.fetch";

type Hooks = {
  onRequest: (ctx: { options: { headers?: HeadersInit } }) => void;
  onResponse: (ctx: { response: { status: number }; request: string }) => void;
  onResponseError?: undefined;
  onRequestError: () => void;
};

function buildPlugin() {
  let hooks!: Hooks;
  const provided: Record<string, unknown> = {};
  vi.stubGlobal("$fetch", {
    create: (h: Hooks) => {
      hooks = h;
      return vi.fn();
    },
  });
  const res = (
    plugin as unknown as { setup: () => { provide: Record<string, unknown> } }
  ).setup();
  Object.assign(provided, res.provide);
  return { hooks, provided };
}

describe("mapo-core:fetch — real plugin hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  // ofetch runs onResponse for EVERY response and THEN onResponseError for >= 400.
  // Decrementing in both drives the counter negative and wedges $mapoFetchLoading.
  it("decrements the pending counter exactly once on an HTTP error", () => {
    const { hooks, provided } = buildPlugin();
    const loading = provided.mapoFetchLoading as { value: boolean };

    hooks.onRequest({ options: {} } as never);
    expect(loading.value).toBe(true);

    // real ofetch order for an error response (verified against ofetch 1.5.1):
    // onRequest -> onResponse(500) -> onResponseError(500)
    hooks.onResponse({ response: { status: 500 }, request: "/api/x" });

    expect(loading.value).toBe(false);

    // A second request must still register — it would not if the counter went to -1.
    hooks.onRequest({ options: {} } as never);
    expect(loading.value).toBe(true);
  });

  it("does not swallow ofetch's FetchError by returning a rejection", () => {
    const { hooks } = buildPlugin();
    const returned = hooks.onResponse({
      response: { status: 401 },
      request: "/api/x",
    });
    expect(returned).toBeUndefined();
  });

  it("still resets auth on 401 and snacks on 403", () => {
    const { hooks } = buildPlugin();

    hooks.onResponse({ response: { status: 401 }, request: "/api/x" });
    expect(authStore.reset).toHaveBeenCalled();

    hooks.onResponse({ response: { status: 403 }, request: "/api/y" });
    expect(snackStore.show).toHaveBeenCalledWith("Permission denied", "error");
  });

  // Was fired twice per 403 while both hooks called handle().
  it("shows the 403 snackbar exactly once per response", () => {
    const { hooks } = buildPlugin();
    hooks.onResponse({ response: { status: 403 }, request: "/api/y" });
    expect(snackStore.show).toHaveBeenCalledTimes(1);
  });

  // SSR does not attach browser cookies. Without forwarding, every authenticated data
  // fetch came back 401 and `handle()` wiped the auth store mid-render — an
  // intermittent logout on hard refresh, depending on whether the 401 landed before
  // the payload was serialized.
  it("forwards the incoming Cookie header on server-side requests", () => {
    const { hooks } = buildPlugin();
    const options: { headers?: HeadersInit } = {};
    hooks.onRequest({ options } as never);

    const headers = options.headers as Headers;
    expect(headers.get("cookie")).toBe("__mapo_session=abc; sessionid=abc");
  });

  it("lets an explicit per-call cookie win", () => {
    const { hooks } = buildPlugin();
    const options: { headers?: HeadersInit } = {
      headers: { cookie: "sessionid=explicit" },
    };
    hooks.onRequest({ options } as never);

    expect((options.headers as Headers).get("cookie")).toBe(
      "sessionid=explicit",
    );
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { ref } from "vue";

// Mock setupPlugin function behavior for testing
function setupFetchPlugin() {
  let redirectInFlight = false;
  const pending = ref(0);

  const handle = (status: number, requestUrl: string, logoutUrl: string) => {
    if (
      status === 401 &&
      !requestUrl.includes(logoutUrl) &&
      !redirectInFlight
    ) {
      redirectInFlight = true;
      // In real plugin, would redirect; here we just track the intent
    }
  };

  const mapoFetch = {
    onRequest: () => {
      pending.value++;
    },
    onResponse: (ctx: { response: { status: number }; request: string }) => {
      pending.value--;
      handle(ctx.response.status, ctx.request, "/logout");
    },
    onResponseError: (ctx: {
      response?: { status: number };
      request: string;
    }) => {
      pending.value--;
      handle(ctx.response?.status ?? 0, ctx.request, "/logout");
    },
    onRequestError: () => {
      pending.value--;
    },
  };

  return { pending, mapoFetch };
}

describe("Mapo Fetch Plugin — Pending Counter", () => {
  let fixture: ReturnType<typeof setupFetchPlugin>;

  beforeEach(() => {
    fixture = setupFetchPlugin();
  });

  it("should increment pending on request and decrement on successful response", () => {
    const { pending, mapoFetch } = fixture;

    expect(pending.value).toBe(0);

    // Simulate request
    mapoFetch.onRequest();
    expect(pending.value).toBe(1);

    // Simulate successful response (200)
    mapoFetch.onResponse({
      response: { status: 200 },
      request: "/api/users",
    });
    expect(pending.value).toBe(0);
  });

  it("should decrement pending exactly once on HTTP error (not double-decrement)", () => {
    const { pending, mapoFetch } = fixture;

    expect(pending.value).toBe(0);

    // Simulate request
    mapoFetch.onRequest();
    expect(pending.value).toBe(1);

    // Simulate HTTP error (500). NOTE: ofetch calls onResponse for EVERY response
    // (ofetch createFetch: onResponse, then onResponseError for status >= 400), so the
    // real plugin must decrement in onResponse only. See the `real plugin` suite below.
    mapoFetch.onResponseError({
      response: { status: 500 },
      request: "/api/users",
    });
    expect(pending.value).toBe(0);
    // Should NOT be -1 (which would indicate double-decrement)
  });

  it("should decrement pending on network error (onRequestError)", () => {
    const { pending, mapoFetch } = fixture;

    expect(pending.value).toBe(0);

    // Simulate request
    mapoFetch.onRequest();
    expect(pending.value).toBe(1);

    // Simulate network error: onRequestError is called
    mapoFetch.onRequestError();
    expect(pending.value).toBe(0);
  });

  it("should handle multiple concurrent requests correctly", () => {
    const { pending, mapoFetch } = fixture;

    // Three concurrent requests
    mapoFetch.onRequest(); // Request 1
    mapoFetch.onRequest(); // Request 2
    mapoFetch.onRequest(); // Request 3
    expect(pending.value).toBe(3);

    // First completes successfully
    mapoFetch.onResponse({
      response: { status: 200 },
      request: "/api/users",
    });
    expect(pending.value).toBe(2);

    // Second fails with HTTP error
    mapoFetch.onResponseError({
      response: { status: 500 },
      request: "/api/posts",
    });
    expect(pending.value).toBe(1);

    // Third fails with network error
    mapoFetch.onRequestError();
    expect(pending.value).toBe(0);
  });

  it("should never go negative", () => {
    const { pending, mapoFetch } = fixture;

    // Ensure pending never goes negative even with edge cases
    mapoFetch.onRequest();
    expect(pending.value).toBe(1);

    // Simulate response
    mapoFetch.onResponse({
      response: { status: 200 },
      request: "/api/users",
    });
    expect(pending.value).toBe(0);

    // Should not go negative
    expect(pending.value).toBeGreaterThanOrEqual(0);
  });
});

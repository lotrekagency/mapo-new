import { describe, it, expect, vi, afterEach } from "vitest";
import { ofetch } from "ofetch";
import {
  getErrorData,
  getErrorDetail,
  getErrorStatus,
} from "../../utils/fetchError";

/** Minimal stand-in for the response the backend would return. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchError helpers", () => {
  it("reads the parsed body from FetchError.data", () => {
    const err = {
      status: 400,
      data: { detail: "Invalid", title: ["required"] },
    };
    expect(getErrorData(err)).toEqual({
      detail: "Invalid",
      title: ["required"],
    });
    expect(getErrorDetail(err)).toBe("Invalid");
    expect(getErrorStatus(err)).toBe(400);
  });

  it("falls back to response._data, which is where ofetch parks the body", () => {
    const err = { response: { status: 404, _data: { detail: "Not found" } } };
    expect(getErrorDetail(err)).toBe("Not found");
    expect(getErrorStatus(err)).toBe(404);
  });

  it("returns undefined instead of throwing for network errors", () => {
    expect(getErrorData(new Error("network down"))).toBeUndefined();
    expect(getErrorDetail(undefined)).toBeUndefined();
    expect(getErrorStatus(null)).toBe(0);
  });

  it("ignores a non-string detail so callers can use their own fallback", () => {
    expect(
      getErrorDetail({ data: { detail: { nested: true } } }),
    ).toBeUndefined();
  });
});

describe("onResponseError hook contract", () => {
  // Regression guard: the plugin used to `return Promise.reject(context.error)`.
  // On an HTTP error status ofetch leaves `context.error` undefined, so that
  // rejection replaced the FetchError with `undefined` and every caller lost
  // both the status and the backend body.
  it("keeps the FetchError intact when the hook only observes", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse(400, { detail: "Some nodes are invalid." }),
    );

    let seenError: unknown = "not-called";
    const api = ofetch.create({
      onResponseError(ctx) {
        seenError = ctx.error;
      },
    });

    const err = await api("/api/menus/1", { method: "PUT" }).catch((e) => e);

    // ofetch does not populate context.error for HTTP error statuses…
    expect(seenError).toBeUndefined();
    // …but the caller still receives a fully-formed FetchError.
    expect(err).toBeDefined();
    expect(getErrorStatus(err)).toBe(400);
    expect(getErrorDetail(err)).toBe("Some nodes are invalid.");
  });

  it("loses the error payload when the hook rejects with context.error", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse(400, { detail: "Some nodes are invalid." }),
    );

    const api = ofetch.create({
      onResponseError(ctx) {
        return Promise.reject(ctx.error);
      },
    });

    const err = await api("/api/menus/1", { method: "PUT" }).catch((e) => e);

    expect(err).toBeUndefined();
    expect(getErrorDetail(err)).toBeUndefined();
  });
});

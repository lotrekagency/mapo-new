import { describe, it, expect } from "vitest";
import { normalizeEndpoint, splitEndpointParams } from "../normalizeEndpoint";

describe("normalizeEndpoint", () => {
  it("adds leading and trailing slash to a bare path", () => {
    expect(normalizeEndpoint("api/articles")).toBe("/api/articles/");
  });

  it("keeps a correctly formed path unchanged", () => {
    expect(normalizeEndpoint("/api/articles/")).toBe("/api/articles/");
  });

  it("adds trailing slash when missing", () => {
    expect(normalizeEndpoint("/api/articles")).toBe("/api/articles/");
  });

  it("removes extra leading slashes", () => {
    expect(normalizeEndpoint("///api/articles/")).toBe("/api/articles/");
  });

  it("removes extra trailing slashes", () => {
    expect(normalizeEndpoint("/api/articles///")).toBe("/api/articles/");
  });

  it("handles a single segment", () => {
    expect(normalizeEndpoint("users")).toBe("/users/");
  });

  it("handles empty string", () => {
    expect(normalizeEndpoint("")).toBe("//");
  });

  it("preserves query string without adding trailing slash after ?", () => {
    expect(normalizeEndpoint("/api/articles/?fields=id,title")).toBe(
      "/api/articles/?fields=id,title",
    );
  });

  it("adds trailing slash before query string when path has no trailing slash", () => {
    expect(normalizeEndpoint("/api/articles?fields=id,title")).toBe(
      "/api/articles/?fields=id,title",
    );
  });

  it("adds leading slash when path with query string has no leading slash", () => {
    expect(normalizeEndpoint("api/articles/?q=1")).toBe("/api/articles/?q=1");
  });
});

describe("splitEndpointParams", () => {
  it("returns empty params when there is no query string", () => {
    expect(splitEndpointParams("/api/articles/")).toEqual({
      path: "/api/articles/",
      params: {},
    });
  });

  it("splits path and parses a single query param", () => {
    expect(splitEndpointParams("/api/articles/?fields=id,title")).toEqual({
      path: "/api/articles/",
      params: { fields: "id,title" },
    });
  });

  it("parses multiple query params", () => {
    expect(splitEndpointParams("/api/articles/?page=2&page_size=50")).toEqual({
      path: "/api/articles/",
      params: { page: "2", page_size: "50" },
    });
  });

  it("handles an empty endpoint", () => {
    expect(splitEndpointParams("")).toEqual({ path: "", params: {} });
  });

  it("returns an empty params object when the query string is empty", () => {
    expect(splitEndpointParams("/api/articles/?")).toEqual({
      path: "/api/articles/",
      params: {},
    });
  });
});

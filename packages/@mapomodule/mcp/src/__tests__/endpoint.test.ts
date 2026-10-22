import { describe, expect, it } from "vitest";
import { mcpEndpointPath, mcpEndpointUrl } from "../runtime/core/endpoint.js";

describe("mcpEndpointPath", () => {
  it("is /mcp/mapo for an app served from the root", () => {
    expect(mcpEndpointPath()).toBe("/mcp/mapo");
    expect(mcpEndpointPath("/")).toBe("/mcp/mapo");
    expect(mcpEndpointPath("./")).toBe("/mcp/mapo");
  });

  // Regression: the startup log used to print /mcp/mapo for an app under a
  // base URL, where that path redirects and the handler answers below the base.
  it("sits under app.baseURL, which Nitro puts in front of every server route", () => {
    expect(mcpEndpointPath("/backoffice/")).toBe("/backoffice/mcp/mapo");
    expect(mcpEndpointPath("/backoffice")).toBe("/backoffice/mcp/mapo");
    expect(mcpEndpointPath("backoffice/admin/")).toBe(
      "/backoffice/admin/mcp/mapo",
    );
  });
});

describe("mcpEndpointUrl", () => {
  it("joins the origin and the path without doubling slashes", () => {
    expect(mcpEndpointUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/mcp/mapo",
    );
    expect(mcpEndpointUrl("http://localhost:3000/", "/backoffice/")).toBe(
      "http://localhost:3000/backoffice/mcp/mapo",
    );
  });
});

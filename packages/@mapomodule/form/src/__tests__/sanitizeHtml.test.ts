import { describe, expect, it } from "vitest";

import { isSafeUrl, sanitizeHtml } from "../runtime/utils/sanitizeHtml.js";

// The URL check behind the editor's sanitizer and its Link extension. The
// sanitizer itself walks a DOM, which these tests do not have.

describe("isSafeUrl", () => {
  it("accepts relative URLs and the allowed protocols", () => {
    for (const url of [
      "/page",
      "page#anchor",
      "?q=1",
      "https://example.com",
      "http://example.com",
      "mailto:a@example.com",
      "tel:+39000",
    ]) {
      expect(isSafeUrl(url), url).toBe(true);
    }
  });

  it("rejects script and data protocols, whatever their case", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      expect(isSafeUrl(url), url).toBe(false);
    }
  });
});

describe("sanitizeHtml", () => {
  it("returns the HTML as it is without a DOM (server side)", () => {
    expect(sanitizeHtml("<p>a</p>")).toBe("<p>a</p>");
    expect(sanitizeHtml("")).toBe("");
  });
});

import { describe, expect, it } from "vitest";

import { mediaFileUrl } from "../runtime/utils/mediaUrl";

const modified = "2026-11-17T10:00:00Z";
const encoded = encodeURIComponent(modified);

describe("mediaFileUrl", () => {
  // The bug it fixes: a file replaced at the same URL kept its URL, so the
  // browser showed the cached old image until a hard refresh.
  it("versions the URL with the modification date", () => {
    expect(mediaFileUrl({ file: "/media/photo.jpg", modified })).toBe(
      `/media/photo.jpg?v=${encoded}`,
    );
  });

  it("falls back to the creation date, which Camomilla updates on save", () => {
    expect(
      mediaFileUrl({ file: "https://cdn.test/photo.jpg", created: modified }),
    ).toBe(`https://cdn.test/photo.jpg?v=${encoded}`);
  });

  it("leaves a URL with a query string alone, so signatures still match", () => {
    const signed = "https://bucket.test/photo.jpg?X-Amz-Signature=abc";
    expect(mediaFileUrl({ file: signed, modified })).toBe(signed);
  });

  it("leaves data and blob URLs alone", () => {
    const data = "data:image/png;base64,AAAA";
    const blob = "blob:http://localhost/1234";
    expect(mediaFileUrl({ file: data, modified })).toBe(data);
    expect(mediaFileUrl({ file: blob, modified })).toBe(blob);
  });

  it("returns the URL unchanged without a date", () => {
    expect(mediaFileUrl({ file: "/media/photo.jpg" })).toBe("/media/photo.jpg");
  });

  it("keeps a fragment after the version", () => {
    expect(mediaFileUrl({ file: "/media/doc.pdf#page=2", modified })).toBe(
      `/media/doc.pdf?v=${encoded}#page=2`,
    );
  });
});

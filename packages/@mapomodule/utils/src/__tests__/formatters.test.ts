import { describe, it, expect } from "vitest";
import { humanFileSize, slugify } from "../formatters.js";

describe("humanFileSize", () => {
  it("returns bytes below the threshold as-is", () => {
    expect(humanFileSize(0)).toBe("0 B");
    expect(humanFileSize(512)).toBe("512 B");
    expect(humanFileSize(-100)).toBe("-100 B");
  });

  it("formats binary units by default", () => {
    expect(humanFileSize(1024)).toBe("1.0 KiB");
    expect(humanFileSize(1536)).toBe("1.5 KiB");
    expect(humanFileSize(1048576)).toBe("1.0 MiB");
  });

  it("formats metric units when si=true", () => {
    expect(humanFileSize(1000, true)).toBe("1.0 kB");
    expect(humanFileSize(1500000, true)).toBe("1.5 MB");
  });

  it("respects decimal places", () => {
    expect(humanFileSize(1536, false, 2)).toBe("1.50 KiB");
    expect(humanFileSize(1536, false, 0)).toBe("2 KiB");
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips accents and invalid characters", () => {
    expect(slugify("Càffé & Co.")).toBe("caffe-co");
  });

  it("collapses whitespace and dashes", () => {
    expect(slugify("  a   b--c  ")).toBe("a-b-c");
  });

  it("handles null/undefined/empty", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
    expect(slugify("")).toBe("");
  });
});

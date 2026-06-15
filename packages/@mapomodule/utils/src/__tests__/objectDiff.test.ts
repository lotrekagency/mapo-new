import { describe, it, expect } from "vitest";
import { objectDiff } from "../objectDiff.js";

describe("objectDiff", () => {
  it("returns empty object when inputs are identical", () => {
    expect(objectDiff({ a: 1 }, { a: 1 })).toEqual({});
  });

  it("detects changed scalar values", () => {
    expect(objectDiff({ a: 1, b: 2 }, { a: 1, b: 99 })).toEqual({ b: 99 });
  });

  it("detects added keys", () => {
    expect(
      objectDiff(
        {} as Record<string, unknown>,
        { a: 1 } as Record<string, unknown>,
      ),
    ).toEqual({ a: 1 });
  });

  it("detects removed keys (value becomes undefined)", () => {
    expect(
      objectDiff(
        { a: 1 } as Record<string, unknown>,
        {} as Record<string, unknown>,
      ),
    ).toEqual({ a: undefined });
  });

  it("handles nested diffs recursively", () => {
    expect(objectDiff({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 99 } })).toEqual({
      a: { y: 99 },
    });
  });

  it("returns empty for identical nested objects", () => {
    expect(objectDiff({ a: { x: 1 } }, { a: { x: 1 } })).toEqual({});
  });

  it("uses Object.is for NaN comparison", () => {
    expect(objectDiff({ a: NaN }, { a: NaN })).toEqual({});
  });

  it("treats arrays with same content as equal (no false positive after deepClone)", () => {
    const base = { items: [1, 2, 3] };
    const current = { items: [1, 2, 3] };
    expect(objectDiff(base, current)).toEqual({});
  });

  it("detects changed array content", () => {
    expect(objectDiff({ items: [1, 2] }, { items: [1, 99] })).toEqual({
      items: [1, 99],
    });
  });

  it("detects added array element", () => {
    expect(objectDiff({ items: [1] }, { items: [1, 2] })).toEqual({
      items: [1, 2],
    });
  });

  it("deep-compares arrays of plain objects", () => {
    const base = { list: [{ id: 1, name: "a" }] };
    const clone = { list: [{ id: 1, name: "a" }] };
    expect(objectDiff(base, clone)).toEqual({});
  });

  it("detects changed property inside array object", () => {
    expect(
      objectDiff(
        { list: [{ id: 1, name: "a" }] },
        { list: [{ id: 1, name: "b" }] },
      ),
    ).toEqual({ list: [{ id: 1, name: "b" }] });
  });
});

import { describe, it, expect } from "vitest";
import {
  deepClone,
  isFile,
  isBlob,
  isFileOrBlob,
  findPropPaths,
  filesInObject,
  filterObj,
} from "../objectHelpers.js";

describe("deepClone", () => {
  it("clones primitives as-is", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("hello")).toBe("hello");
    expect(deepClone(null)).toBe(null);
  });

  it("deep-clones a nested object", () => {
    const obj = { a: 1, b: { c: 2, d: [3, 4] } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);
    expect(clone.b.d).not.toBe(obj.b.d);
  });

  it("mutations on clone do not affect original", () => {
    const obj = { x: { y: 1 } };
    const clone = deepClone(obj);
    clone.x.y = 99;
    expect(obj.x.y).toBe(1);
  });

  it("clones arrays", () => {
    const arr = [1, [2, 3], { a: 4 }];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
  });

  it("unwraps Vue-like reactive wrappers before cloning", () => {
    const raw = { a: 1, nested: { b: 2 } };
    const vueLikeProxy = { __v_raw: raw } as unknown;

    const clone = deepClone(vueLikeProxy) as typeof raw;
    expect(clone).toEqual(raw);
    expect(clone).not.toBe(raw);
    expect(clone.nested).not.toBe(raw.nested);
  });

  it("falls back to recursive clone when structuredClone throws", () => {
    const original = globalThis.structuredClone;
    Object.defineProperty(globalThis, "structuredClone", {
      configurable: true,
      value: () => {
        throw new Error("boom");
      },
    });

    try {
      const obj = { a: 1, nested: { b: 2 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.nested).not.toBe(obj.nested);
    } finally {
      Object.defineProperty(globalThis, "structuredClone", {
        configurable: true,
        value: original,
      });
    }
  });

  it("falls back to recursive clone when structuredClone is unavailable", () => {
    const original = globalThis.structuredClone;
    Object.defineProperty(globalThis, "structuredClone", {
      configurable: true,
      value: undefined,
    });

    try {
      const obj = { a: 1, nested: { b: 2 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.nested).not.toBe(obj.nested);
    } finally {
      Object.defineProperty(globalThis, "structuredClone", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("isFile / isBlob / isFileOrBlob", () => {
  it("identifies plain objects as non-file", () => {
    expect(isFile({})).toBe(false);
    expect(isBlob({})).toBe(false);
    expect(isFileOrBlob({})).toBe(false);
  });

  it("identifies Blob instances", () => {
    const blob = new Blob(["data"], { type: "text/plain" });
    expect(isBlob(blob)).toBe(true);
    expect(isFileOrBlob(blob)).toBe(true);
    expect(isFile(blob)).toBe(false);
  });

  it("identifies File instances", () => {
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    expect(isFile(file)).toBe(true);
    expect(isFileOrBlob(file)).toBe(true);
    expect(isBlob(file)).toBe(true); // File extends Blob
  });

  it("returns false for primitives", () => {
    expect(isFileOrBlob(null)).toBe(false);
    expect(isFileOrBlob(42)).toBe(false);
    expect(isFileOrBlob("string")).toBe(false);
  });
});

describe("findPropPaths", () => {
  it("finds top-level paths matching predicate", () => {
    const obj = { a: 1, b: "hello", c: 2 };
    expect(findPropPaths(obj, (v) => typeof v === "number")).toEqual([
      "a",
      "c",
    ]);
  });

  it("finds nested paths with dot notation", () => {
    const obj = { user: { avatar: new File([], "a.png"), name: "Alice" } };
    expect(findPropPaths(obj, isFile)).toEqual(["user.avatar"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(findPropPaths({ a: 1 }, isFile)).toEqual([]);
  });

  it("returns empty array for non-objects", () => {
    expect(findPropPaths(null, () => true)).toEqual([]);
    expect(findPropPaths(42, () => true)).toEqual([]);
  });
});

describe("filesInObject", () => {
  it("returns paths of File/Blob values", () => {
    const file = new File([], "doc.pdf");
    const blob = new Blob(["x"]);
    const obj = { title: "Hello", attachment: file, meta: { thumb: blob } };
    expect(filesInObject(obj)).toEqual(["attachment", "meta.thumb"]);
  });

  it("returns empty array when no files", () => {
    expect(filesInObject({ a: 1, b: "text" })).toEqual([]);
  });
});

describe("filterObj", () => {
  it("returns only the listed keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(filterObj(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores keys not present in obj", () => {
    const obj = { a: 1 } as Record<string, unknown>;
    expect(filterObj(obj, ["a", "z" as keyof typeof obj])).toEqual({ a: 1 });
  });

  it("returns empty object for empty key list", () => {
    expect(filterObj({ a: 1, b: 2 }, [])).toEqual({});
  });
});

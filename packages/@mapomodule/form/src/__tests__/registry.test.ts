import { describe, it, expect } from "vitest";
import {
  resolveFieldComponent,
  resolveFieldAttrs,
  resolveFieldAccessor,
} from "../runtime/types/registry.js";
import { defaultRegistry } from "../runtime/registry/defaults.js";
import type {
  AnyFieldDescriptor,
  FieldDescriptor,
} from "../runtime/types/descriptor.js";

describe("resolveFieldComponent", () => {
  it("returns a lazy function for text type", () => {
    const d = { key: "title", type: "text" } as FieldDescriptor;
    expect(typeof resolveFieldComponent(d, defaultRegistry)).toBe("function");
  });

  it("returns a lazy function for select type", () => {
    const d = {
      key: "cat",
      type: "select",
      attrs: { options: [] },
    } as FieldDescriptor;
    expect(typeof resolveFieldComponent(d, defaultRegistry)).toBe("function");
  });

  it("returns a lazy function for date type", () => {
    const d = { key: "pub", type: "date" } as FieldDescriptor;
    const entry = resolveFieldComponent(d, defaultRegistry);
    expect(typeof entry).toBe("function");
  });

  it("descriptor.is overrides registry", () => {
    const CustomComp = {} as any;
    const d = { key: "x", type: "text", is: CustomComp } as FieldDescriptor;
    expect(resolveFieldComponent(d, defaultRegistry)).toBe(CustomComp);
  });

  it("returns null for unknown type", () => {
    const d = { key: "x", type: "unknown-xyz" } as AnyFieldDescriptor;
    expect(resolveFieldComponent(d, defaultRegistry)).toBeNull();
  });

  it("user registry override wins over default", () => {
    const CustomFn = () => Promise.resolve({ default: {} as any });
    const registry = {
      ...defaultRegistry,
      mapping: { ...defaultRegistry.mapping, text: CustomFn },
    };
    const d = { key: "title", type: "text" } as FieldDescriptor;
    expect(resolveFieldComponent(d, registry)).toBe(CustomFn);
  });
});

describe("resolveFieldAttrs", () => {
  it("applies All attrs to every field", () => {
    const d = { key: "x", type: "text" } as FieldDescriptor;
    const attrs = resolveFieldAttrs(d, defaultRegistry);
    expect(attrs.class).toBe("w-full");
  });

  it("merges type-specific attrs", () => {
    const d = { key: "n", type: "number" } as FieldDescriptor;
    const attrs = resolveFieldAttrs(d, defaultRegistry);
    expect(attrs.type).toBe("number");
    expect(attrs.class).toBe("w-full");
  });

  it("descriptor.attrs wins over registry", () => {
    const d = {
      key: "n",
      type: "text",
      attrs: { placeholder: "Hello" },
    } as FieldDescriptor;
    const attrs = resolveFieldAttrs(d, defaultRegistry);
    expect(attrs.placeholder).toBe("Hello");
  });
});

describe("resolveFieldAccessor", () => {
  it("returns empty accessor for types without registry accessor", () => {
    const d = { key: "title", type: "text" } as FieldDescriptor;
    const acc = resolveFieldAccessor(d, defaultRegistry);
    expect(acc.get).toBeUndefined();
    expect(acc.set).toBeUndefined();
  });

  it("returns accessor for seo type", () => {
    const d = { key: "seo", type: "seo" } as FieldDescriptor;
    const acc = resolveFieldAccessor(d, defaultRegistry);
    expect(typeof acc.get).toBe("function");
  });

  it("descriptor.accessor.get overrides registry", () => {
    const customGet = () => "custom";
    const d = {
      key: "x",
      type: "seo",
      accessor: { get: customGet },
    } as FieldDescriptor;
    const acc = resolveFieldAccessor(d, defaultRegistry);
    expect(acc.get).toBe(customGet);
  });
});

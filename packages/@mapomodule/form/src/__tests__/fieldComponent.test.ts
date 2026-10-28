import { describe, it, expect } from "vitest";
import type { Component } from "vue";
import { toFieldComponent } from "../runtime/utils/fieldComponent.js";

const loaderOf = (component: Component) => () =>
  Promise.resolve({ default: component });

describe("toFieldComponent", () => {
  it("wraps a lazy loader in an async component", () => {
    const loader = loaderOf({ name: "TextField" });
    expect(toFieldComponent(loader)).not.toBe(loader);
  });

  it("returns the same async component for the same loader", () => {
    const loader = loaderOf({ name: "TextField" });
    expect(toFieldComponent(loader)).toBe(toFieldComponent(loader));
  });

  it("gives each loader its own async component", () => {
    const component: Component = { name: "TextField" };
    expect(toFieldComponent(loaderOf(component))).not.toBe(
      toFieldComponent(loaderOf(component)),
    );
  });

  it("returns component names and components as they are", () => {
    const component: Component = { name: "StarRatingField" };
    expect(toFieldComponent("UInput")).toBe("UInput");
    expect(toFieldComponent(component)).toBe(component);
  });
});

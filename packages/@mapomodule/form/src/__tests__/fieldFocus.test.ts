import { afterEach, describe, expect, it, vi } from "vitest";

import { focusFieldControl, refocusField } from "../runtime/utils/fieldFocus";

/** An element as `refocusField()` reads it: what it matches, what it holds, `focus()`. */
interface FakeElement {
  matches(selector: string): boolean;
  querySelector(selector: string): FakeElement | null;
  focus: ReturnType<typeof vi.fn>;
}

function element(focusable: boolean, inside: FakeElement | null = null) {
  const made: FakeElement = {
    matches: () => focusable,
    querySelector: () => inside,
    focus: vi.fn(),
  };
  return made;
}

const body = element(false);

/** A page whose focus is on `active`, with the elements of `byId`. */
function page(active: FakeElement | null, byId: Record<string, FakeElement>) {
  vi.stubGlobal("document", {
    body,
    activeElement: active,
    getElementById: (id: string) => byId[id] ?? null,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refocusField", () => {
  it("focuses the field's control when the focus fell on the page", () => {
    const input = element(true);
    page(body, { "field-title": input });

    expect(refocusField("field-title")).toBe(true);
    expect(input.focus).toHaveBeenCalledTimes(1);
  });

  it("focuses what takes the focus inside the field, as an editor's content", () => {
    const content = element(true);
    const editor = element(false, content);
    page(null, { "field-body": editor });

    expect(refocusField("field-body")).toBe(true);
    expect(content.focus).toHaveBeenCalledTimes(1);
    expect(editor.focus).not.toHaveBeenCalled();
  });

  it("leaves a focus held elsewhere where it is, as by a dialog", () => {
    const input = element(true);
    const dialog = element(true);
    page(dialog, { "field-title": input });

    expect(refocusField("field-title")).toBe(false);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it("does nothing for a field it cannot find, or one with nothing to focus", () => {
    page(body, { "field-plain": element(false) });

    expect(refocusField("field-missing")).toBe(false);
    expect(refocusField("field-plain")).toBe(false);
  });

  it("does nothing on the server", () => {
    expect(typeof document).toBe("undefined");
    expect(refocusField("field-title")).toBe(false);
  });
});

/** The page of {@link focusFieldControl}: what has the focus. */
interface FakeDocument {
  activeElement: unknown;
}

/** A field's control: whether it takes the focus, and the focusable inside it. */
function control(doc: FakeDocument, focusable: boolean, inside?: unknown) {
  const made = {
    matches: () => focusable,
    querySelector: () => inside ?? null,
    focus: vi.fn(() => {
      doc.activeElement = made;
    }),
  };
  return made;
}

/** A field's element, holding `byId` and scrolled with `scrollIntoView`. */
function fieldElement(doc: FakeDocument, byId: Record<string, unknown>) {
  return {
    ownerDocument: doc,
    querySelector: vi.fn((selector: string) => {
      const id = /^\[id="(.*)"\]$/.exec(selector)?.[1] ?? "";
      return byId[id] ?? null;
    }),
    scrollIntoView: vi.fn(),
  };
}

describe("focusFieldControl", () => {
  it("focuses the control with the field's id inside the field, and scrolls the field to the middle", () => {
    const doc: FakeDocument = { activeElement: null };
    const input = control(doc, true);
    const field = fieldElement(doc, { "field-title": input });

    expect(focusFieldControl(field, "field-title")).toBe(true);
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(field.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });

  it("focuses what takes the focus inside the control, as an editor's content", () => {
    const doc: FakeDocument = { activeElement: null };
    const content = control(doc, true);
    const editor = control(doc, false, content);
    const field = fieldElement(doc, { "field-body": editor });

    expect(focusFieldControl(field, "field-body")).toBe(true);
    expect(content.focus).toHaveBeenCalledTimes(1);
    expect(editor.focus).not.toHaveBeenCalled();
  });

  it("does not animate the scroll when the operator asks for reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }),
    });
    const doc: FakeDocument = { activeElement: null };
    const field = fieldElement(doc, { "field-title": control(doc, true) });

    focusFieldControl(field, "field-title");

    expect(field.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "auto",
    });
  });

  it("answers false when the control does not keep the focus, as a disabled one", () => {
    const doc: FakeDocument = { activeElement: null };
    const disabled = { ...control(doc, true), focus: vi.fn() };
    const field = fieldElement(doc, { "field-title": disabled });

    expect(focusFieldControl(field, "field-title")).toBe(false);
  });

  it("answers false before the control renders, or with nothing to focus in it", () => {
    const doc: FakeDocument = { activeElement: null };
    const field = fieldElement(doc, { "field-plain": control(doc, false) });

    expect(focusFieldControl(field, "field-title")).toBe(false);
    expect(focusFieldControl(field, "field-plain")).toBe(false);
    expect(field.scrollIntoView).not.toHaveBeenCalled();
  });

  it("answers false for what is not an element, as a headless node", () => {
    expect(focusFieldControl(null, "field-title")).toBe(false);
    expect(focusFieldControl({ tag: "div" }, "field-title")).toBe(false);
  });

  it("looks the control up by an id written safely into the selector", () => {
    const doc: FakeDocument = { activeElement: null };
    const field = fieldElement(doc, {});

    focusFieldControl(field, 'field-a"b');

    expect(field.querySelector).toHaveBeenCalledWith('[id="field-a\\"b"]');
  });
});

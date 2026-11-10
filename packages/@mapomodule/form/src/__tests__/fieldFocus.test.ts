import { afterEach, describe, expect, it, vi } from "vitest";

import { refocusField } from "../runtime/utils/fieldFocus";

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

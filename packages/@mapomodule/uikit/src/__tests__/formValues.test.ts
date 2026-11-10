import { describe, expect, it } from "vitest";
import { holdsFormValue } from "../runtime/utils/formValues.js";

describe("holdsFormValue", () => {
  it.each([
    ["nothing", undefined],
    ["null", null],
    ["an empty text", ""],
    ["spaces", "   "],
    ["an editor's empty paragraph", "<p></p>"],
    ["blank markup", "<p>&nbsp;</p><br/><P> </P>"],
    ["an empty list", []],
    ["an empty object", {}],
    ["objects that hold nothing", { translations: { en: { title: "" } } }],
  ])("holds nothing in %s", (_name, value) => {
    expect(holdsFormValue(value)).toBe(false);
  });

  it.each([
    ["false", false],
    ["0", 0],
    ["a text", "Hello"],
    ["a paragraph", "<p>Hi</p>"],
    ["a list", [{}]],
    ["a value deep inside", { translations: { it: { featured: false } } }],
    ["a date", new Date(0)],
    ["a file", new Blob(["x"])],
  ])("holds %s", (_name, value) => {
    expect(holdsFormValue(value)).toBe(true);
  });
});

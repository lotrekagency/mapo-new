import { describe, expect, it } from "vitest";

import {
  languagesFromMetadata,
  pickLanguage,
  restrictLanguages,
} from "../runtime/utils/langInfo";

describe("languagesFromMetadata", () => {
  it("reads the model's own language list", () => {
    expect(
      languagesFromMetadata({
        lang_info: { translatable: true, languages: ["it", "en"] },
      }),
    ).toEqual(["it", "en"]);
  });

  it("returns nothing for a model that is not translatable", () => {
    // The site is multilingual; this model is not. Tabs here would collect
    // values the backend silently discards.
    expect(
      languagesFromMetadata({
        lang_info: {
          translatable: false,
          languages: [],
          site_languages: ["it", "en"],
        },
      }),
    ).toEqual([]);
  });

  it("never falls back to the site's languages", () => {
    // site_languages is context, not permission to translate this model.
    expect(
      languagesFromMetadata({ lang_info: { site_languages: ["it", "en"] } }),
    ).toEqual([]);
  });

  it("treats missing lang_info as not translatable", () => {
    expect(languagesFromMetadata({ actions: {} })).toEqual([]);
    expect(languagesFromMetadata(null)).toEqual([]);
    expect(languagesFromMetadata(undefined)).toEqual([]);
  });

  it("drops entries that are not codes", () => {
    expect(
      languagesFromMetadata({
        lang_info: { translatable: true, languages: ["it", 42, null] },
      }),
    ).toEqual(["it"]);
  });
});

describe("pickLanguage", () => {
  it("starts from the preferred language when the list offers it", () => {
    expect(pickLanguage(["it", "en"], "en")).toBe("en");
  });

  it("falls back to the first language otherwise", () => {
    expect(pickLanguage(["it", "en"], "de")).toBe("it");
    expect(pickLanguage(["it", "en"])).toBe("it");
  });

  it("returns an empty code for a model that is not translated", () => {
    expect(pickLanguage([], "it")).toBe("");
  });
});

describe("restrictLanguages", () => {
  it("restricts nothing without content languages", () => {
    expect(restrictLanguages(["it", "en"], [])).toEqual(["it", "en"]);
  });

  it("keeps the content languages, in their order", () => {
    expect(restrictLanguages(["it", "en", "fr"], ["fr", "it"])).toEqual([
      "fr",
      "it",
    ]);
  });

  it("never adds a language the list does not offer", () => {
    expect(restrictLanguages(["it", "en"], ["it", "de"])).toEqual(["it"]);
    expect(restrictLanguages([], ["it"])).toEqual([]);
  });
});

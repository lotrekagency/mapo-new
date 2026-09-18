import { describe, expect, it } from "vitest";

import { languagesFromMetadata } from "../runtime/utils/langInfo";

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

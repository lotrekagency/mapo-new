import { describe, expect, it } from "vitest";

import { defaultMediaAdapter } from "../runtime/adapters/defaultMediaAdapter";
import {
  buildUploadBody,
  describeMediaErrors,
  mediaMetadataPatch,
} from "../runtime/utils/mediaMetadata";
import type { MediaItem } from "../runtime/types/media";

const stored: MediaItem = {
  id: 7,
  file: "/media/photo.jpg",
  mime_type: "image/jpeg",
  title: "Foto",
  alt_text: "",
  description: "",
  size: 1000,
  created: "2026-11-01T00:00:00Z",
  modified: "2026-11-01T00:00:00Z",
  translations: {
    it: { title: "Foto", alt_text: "", description: "" },
    en: { title: "Photo", alt_text: "", description: "" },
  },
};

const withTranslation = (
  lang: string,
  values: Record<string, string>,
): MediaItem => ({
  ...stored,
  translations: {
    ...stored.translations,
    [lang]: { ...stored.translations?.[lang], ...values },
  },
});

describe("mediaMetadataPatch", () => {
  // The bug it fixes: the editor used to send every plain field and every
  // translation it had read. Camomilla ignores the plain fields and applies
  // the translations, so the stale values overwrote the edit.
  it("sends only the translation that changed", () => {
    const edited = withTranslation("it", { title: "Nuovo titolo" });
    expect(mediaMetadataPatch(edited, stored)).toEqual({
      translations: { it: { title: "Nuovo titolo" } },
    });
  });

  it("sends a changed plain field of untranslated media", () => {
    const edited = { ...stored, translations: undefined, alt_text: "Alt" };
    const before = { ...stored, translations: undefined };
    expect(mediaMetadataPatch(edited, before)).toEqual({ alt_text: "Alt" });
  });

  it("sends nothing when nothing changed", () => {
    expect(mediaMetadataPatch(stored, stored)).toEqual({});
  });

  it("treats null and an empty string as the same empty value", () => {
    const before = { ...stored, description: null as unknown as string };
    const edited = { ...stored, description: "" };
    expect(mediaMetadataPatch(edited, before)).toEqual({});
  });

  it("sends a cleared value as an empty string", () => {
    const edited = withTranslation("en", { title: "" });
    expect(mediaMetadataPatch(edited, stored)).toEqual({
      translations: { en: { title: "" } },
    });
  });
});

describe("defaultMediaAdapter.buildMediaPatchPayload", () => {
  it("diffs against the copy taken when editing started", () => {
    const edited = withTranslation("en", { alt_text: "A photo" });
    expect(defaultMediaAdapter.buildMediaPatchPayload(edited, stored)).toEqual({
      translations: { en: { alt_text: "A photo" } },
    });
  });

  it("keeps the full payload for callers that pass no previous copy", () => {
    expect(defaultMediaAdapter.buildMediaPatchPayload(stored)).toEqual({
      title: "Foto",
      alt_text: "",
      description: "",
      translations: stored.translations,
    });
  });
});

describe("buildUploadBody", () => {
  const file = new Blob(["x"]) as File;

  it("puts the metadata in the given language's translation", () => {
    expect(
      buildUploadBody(
        { file, title: "Foto", alt_text: "Una foto", folder: 3 },
        "it",
      ),
    ).toEqual({
      file,
      translations: { it: { title: "Foto", alt_text: "Una foto" } },
      folder: 3,
    });
  });

  it("keeps plain fields when media are not translated", () => {
    expect(buildUploadBody({ file, title: "Photo", folder: null })).toEqual({
      file,
      title: "Photo",
    });
  });

  it("adds no translation when there is no metadata", () => {
    expect(buildUploadBody({ file, title: "" }, "it")).toEqual({ file });
  });
});

describe("describeMediaErrors", () => {
  const labels = { title: "Title", alt_text: "Alt text", file: "File" };

  it("labels plain fields", () => {
    expect(
      describeMediaErrors({ file: ["Upload a valid image."] }, labels),
    ).toEqual(["File: Upload a valid image."]);
  });

  it("labels per-language columns with their language", () => {
    expect(
      describeMediaErrors(
        {
          title_it: ["Ensure this field has no more than 200 characters."],
          alt_text_en: ["Too long.", "Not allowed."],
        },
        labels,
      ),
    ).toEqual([
      "Title (IT): Ensure this field has no more than 200 characters.",
      "Alt text (EN): Too long., Not allowed.",
    ]);
  });

  it("labels nested translations with their language", () => {
    expect(
      describeMediaErrors(
        { translations: { en: { title: ["Required."] } } },
        labels,
      ),
    ).toEqual(["Title (EN): Required."]);
  });

  it("shows request-wide messages without a label", () => {
    expect(
      describeMediaErrors(
        { detail: "Not found.", non_field_errors: ["Invalid."] },
        labels,
      ),
    ).toEqual(["Not found.", "Invalid."]);
  });

  it("keeps the key of an unknown field and ignores what is not a message", () => {
    expect(describeMediaErrors({ size: ["Too big."] }, labels)).toEqual([
      "size: Too big.",
    ]);
    expect(describeMediaErrors(undefined, labels)).toEqual([]);
    // An HTML error page is no message for a toast.
    expect(describeMediaErrors("<html>Bad gateway</html>", labels)).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import en from "../../../i18n/src/runtime/locales/mapo.en.json";
import it_ from "../../../i18n/src/runtime/locales/mapo.it.json";
import type { MapoAiFillEntry, MapoAiFillReview } from "../runtime/shared/fill";
import {
  MapoAiFillAnswerError,
  mapoAiFillRequest,
} from "../runtime/shared/fill";
import type { MapoAiSourcePart, MapoAiStatus } from "../runtime/shared/gateway";
import {
  MAPO_AI_NAMED_SKIP_REASONS,
  checkMapoAiSource,
  defaultMapoAiChoice,
  isCallableProvider,
  mapoAiPreselected,
  mapoAiPreselectedItems,
  mapoAiProviderChoices,
  mapoAiSkipReasonKey,
  mapoAiSourceParts,
  previewMapoAiFill,
  readMapoAiRunPreview,
  readMapoAiStatus,
  sourceChars,
  summarizeMapoAiFill,
} from "../runtime/shared/magicFill";
import type {
  MapoAiFillSummary,
  MapoAiWaitReason,
} from "../runtime/shared/magicFill";
import type { AiFieldOutcome } from "../runtime/shared/sanitize";

/** What `status` answers a user the app lets in, with a provider that lacks its key. */
const STATUS = {
  contract: 2,
  allowed: true,
  admin: false,
  providers: [
    { id: "mock", label: "Mock", models: ["mock"] },
    {
      id: "openai",
      label: "OpenAI",
      models: ["gpt-6.1-sol", "gpt-6-luna"],
      key: {
        level: "none",
        required: true,
        personal: { allowed: false, saved: false },
      },
    },
    {
      id: "ollama",
      models: ["qwen3.8:27b", "gemma4:12b"],
      key: {
        level: "none",
        required: false,
        personal: { allowed: false, saved: false },
      },
    },
  ],
  default: {
    provider: "ollama",
    models: { fill: "gemma4:12b", extract: "qwen3.8:27b" },
  },
  limits: {
    perUserPerMinute: 20,
    maxSourceChars: 100,
    maxInstructionsChars: 20,
    maxFileBytes: 1000,
  },
  readers: [
    { id: "text", label: "Text", extensions: ["txt"], types: ["text/plain"] },
  ],
};

function text(value: string, name?: string): MapoAiSourcePart {
  return { kind: "text", text: value, ...(name ? { name } : {}) };
}

describe("readMapoAiStatus", () => {
  it("reads what status answers", () => {
    expect(readMapoAiStatus(STATUS)).toEqual(STATUS);
  });

  it("reads the storage an admin is told about", () => {
    const status = readMapoAiStatus({
      ...STATUS,
      admin: true,
      storage: { open: true, secret: "set", mounted: true, driver: "fs" },
    });

    expect(status?.storage).toEqual({
      open: true,
      secret: "set",
      mounted: true,
      driver: "fs",
    });
  });

  it("is nothing for an answer that is no status", () => {
    expect(readMapoAiStatus(undefined)).toBeUndefined();
    expect(readMapoAiStatus("ok")).toBeUndefined();
    expect(readMapoAiStatus({ ...STATUS, allowed: "yes" })).toBeUndefined();
    expect(readMapoAiStatus({ allowed: true, admin: false })).toBeUndefined();
  });

  it("leaves out a provider, a reader or the limits it cannot read, and a provider whose key it cannot read", () => {
    const status = readMapoAiStatus({
      ...STATUS,
      providers: [
        ...STATUS.providers,
        { id: "broken", models: "all" },
        { id: "keyless", models: ["one"], key: { level: "somewhere" } },
        "nothing",
      ],
      limits: { ...STATUS.limits, maxSourceChars: -1 },
      readers: [...STATUS.readers, { id: "pdf", extensions: [".pdf", 3] }],
    });

    expect(status?.providers?.map((provider) => provider.id)).toEqual([
      "mock",
      "openai",
      "ollama",
    ]);
    expect(status?.limits).toBeUndefined();
    expect(status?.readers?.map((reader) => reader.id)).toEqual(["text"]);
  });

  it("reads a user the app keeps out, with nothing the AI offers", () => {
    expect(
      readMapoAiStatus({ contract: 2, allowed: false, admin: false }),
    ).toEqual({ contract: 2, allowed: false, admin: false });
  });
});

describe("the provider and the model", () => {
  const status = readMapoAiStatus(STATUS) as MapoAiStatus;

  it("offers what run may call: not a provider that needs a key the user lacks", () => {
    expect(
      status.providers?.map((provider) => isCallableProvider(provider)),
    ).toEqual([true, false, true]);
    expect(mapoAiProviderChoices(status)).toEqual([
      { provider: "mock", model: "mock", providerLabel: "Mock" },
      { provider: "ollama", model: "qwen3.8:27b", providerLabel: "ollama" },
      { provider: "ollama", model: "gemma4:12b", providerLabel: "ollama" },
    ]);
  });

  it("starts from the default of the task, the user's preference included", () => {
    expect(defaultMapoAiChoice(status, "fill")).toMatchObject({
      provider: "ollama",
      model: "gemma4:12b",
    });
    expect(defaultMapoAiChoice(status, "extract")).toMatchObject({
      provider: "ollama",
      model: "qwen3.8:27b",
    });
  });

  it("starts from the first it may call when the default is a provider it may not", () => {
    const keyless = {
      ...status,
      default: {
        provider: "openai",
        models: { fill: "gpt-6.1-sol", extract: "gpt-6.1-sol" },
      },
    };

    expect(defaultMapoAiChoice(keyless, "fill")).toMatchObject({
      provider: "mock",
      model: "mock",
    });
    expect(
      defaultMapoAiChoice(
        { ...status, providers: [status.providers![1]!] },
        "fill",
      ),
    ).toBeUndefined();
  });
});

describe("the source", () => {
  it("puts the pasted text first, then the files' parts, with names run takes", () => {
    const long = "x".repeat(250);

    expect(
      mapoAiSourceParts("About us", [
        [text("One", "a.md")],
        [text("Two", long), text("Three", long)],
      ]),
    ).toEqual([
      text("About us"),
      text("One", "a.md"),
      text("Two", "x".repeat(200)),
      text("Three", "x".repeat(200)),
    ]);
    expect(mapoAiSourceParts("  \n ", [[text("One", "a.md")]])).toEqual([
      text("One", "a.md"),
    ]);
  });

  it("counts every part together, as run does", () => {
    expect(sourceChars([text("abc"), text("de", "f.md")])).toBe(5);
  });

  it("finds an empty source, and too many parts, even without limits", () => {
    expect(checkMapoAiSource([], "")).toEqual([{ kind: "empty" }]);
    expect(checkMapoAiSource([text("  ")], "")).toEqual([{ kind: "empty" }]);
    const many = Array.from({ length: 21 }, (_, at) => text(`part ${at}`));
    expect(checkMapoAiSource(many, "")).toEqual([
      { kind: "too-many-parts", parts: 21, max: 20 },
    ]);
  });

  it("finds a source and instructions longer than the limits, the instructions trimmed as they are sent", () => {
    const limits = STATUS.limits;

    expect(checkMapoAiSource([text("x".repeat(100))], "", limits)).toEqual([]);
    expect(
      checkMapoAiSource(
        [text("x".repeat(60)), text("y".repeat(41))],
        "",
        limits,
      ),
    ).toEqual([{ kind: "too-long", chars: 101, max: 100 }]);
    expect(
      checkMapoAiSource([text("ok")], `   ${"i".repeat(20)}   `, limits),
    ).toEqual([]);
    expect(checkMapoAiSource([text("ok")], "i".repeat(21), limits)).toEqual([
      { kind: "instructions-too-long", chars: 21, max: 20 },
    ]);
  });

  it("finds instructions where the app takes none", () => {
    const limits = { ...STATUS.limits, maxInstructionsChars: 0 };

    expect(checkMapoAiSource([text("ok")], "Only the title.", limits)).toEqual([
      { kind: "no-instructions" },
    ]);
    expect(checkMapoAiSource([text("ok")], "   ", limits)).toEqual([]);
  });
});

describe("What I send to the AI", () => {
  const PREVIEW = {
    task: "fill",
    provider: { id: "mock", model: "mock" },
    prompt: 1,
    instructions: "# Rules (Mapo, version 1)",
    operator: "# The operator's instructions\n\nOnly the title.",
    parts: [{ name: "about.md", chars: 15 }, { chars: 0 }],
    entities: [
      {
        label: "Article",
        fields: [{ key: "title", label: "Title" }, { key: "summary" }],
        skipped: [{ key: "password", label: "Password", reason: "secret" }],
      },
    ],
  };

  it("posts the same request as run, to run/preview, and reads the answer", async () => {
    const post = vi.fn(async () => PREVIEW);
    const input = {
      fields: [{ key: "title", type: "text", label: "Title" }],
      source: "Title: About us",
      instructions: "Only the title.",
      entity: { label: "Article", model: "article" },
    } as const;

    const preview = await previewMapoAiFill(input, { post });

    expect(post).toHaveBeenCalledWith(
      "/_mapo/ai/run/preview",
      mapoAiFillRequest(input),
      { signal: undefined },
    );
    expect(preview).toEqual(PREVIEW);
  });

  it("throws for an answer that is no preview", async () => {
    await expect(
      previewMapoAiFill(
        { fields: [], source: "x" },
        { post: async () => ({ task: "fill" }) },
      ),
    ).rejects.toBeInstanceOf(MapoAiFillAnswerError);
  });

  it("leaves out a part, a field or an entity it cannot read", () => {
    const preview = readMapoAiRunPreview({
      ...PREVIEW,
      parts: [...PREVIEW.parts, { name: "bad", chars: -1 }, "nothing"],
      entities: [
        {
          ...PREVIEW.entities[0],
          fields: [...PREVIEW.entities[0]!.fields, { label: "No key" }],
          skipped: [
            ...PREVIEW.entities[0]!.skipped,
            { key: "token", label: "Token" },
          ],
        },
        { label: "No lists" },
      ],
    });

    expect(preview).toEqual(PREVIEW);
    expect(readMapoAiRunPreview({ ...PREVIEW, provider: {} })).toBeUndefined();
    expect(readMapoAiRunPreview({ ...PREVIEW, task: "chat" })).toBeUndefined();
  });

  it("names why a field is kept away, and leaves a reason it does not know as the gateway wrote it", () => {
    expect(mapoAiSkipReasonKey("secret")).toBe(
      "mapo.ai.magicFill.preview.reasons.secret",
    );
    expect(mapoAiSkipReasonKey("too-deep")).toBe(
      "mapo.ai.magicFill.preview.reasons.too-deep",
    );
    // A newer gateway's reason, and a name every object has.
    expect(mapoAiSkipReasonKey("too-costly")).toBeUndefined();
    expect(mapoAiSkipReasonKey("toString")).toBeUndefined();
  });

  it("has a message for every reason it names, in both catalogs", () => {
    for (const catalog of [en, it_]) {
      const messages = Object.keys(catalog.mapo.ai.magicFill.preview.reasons);
      expect(messages.sort()).toEqual([...MAPO_AI_NAMED_SKIP_REASONS].sort());
    }
  });
});

describe("summarizeMapoAiFill", () => {
  function entry(
    key: string,
    action: MapoAiFillEntry["action"],
    outcome: AiFieldOutcome,
    extra: Partial<
      MapoAiFillEntry & {
        applied: boolean;
        review: MapoAiFillReview;
        current: unknown;
        languages: Record<string, unknown>;
      }
    > = {},
  ): MapoAiFillEntry & {
    applied: boolean;
    review?: MapoAiFillReview;
    current?: unknown;
    languages?: Record<string, unknown>;
  } {
    return {
      key,
      path: key,
      action,
      replaces: false,
      shown: true,
      outcome,
      applied: false,
      ...extra,
    };
  }
  /** A value with a quote, found when it is verified; with none when `quoted` is false. */
  const filled = (
    value: string,
    verified: boolean,
    quoted = true,
  ): AiFieldOutcome => ({
    status: "filled",
    value,
    verified,
    quotes: quoted ? [{ quote: value, where: "", found: verified }] : [],
  });

  it("counts what went in, what waits, what to set by hand, what was discarded and what was not found", () => {
    const summary = summarizeMapoAiFill([
      entry("title", "apply", filled("About us", true), { applied: true }),
      entry("summary", "confirm", filled("A summary", false)),
      entry("slug", "confirm", filled("about-us", true), { replaces: true }),
      entry("notes", "confirm", filled("Hidden", false), { shown: false }),
      entry("category", "manual", filled("News", true)),
      entry("rating", "discard", {
        status: "discarded",
        reason: "too-high",
        proposed: 9,
        quotes: [],
      }),
      entry("author", "empty", { status: "empty" }),
    ]);

    expect(summary).toEqual({
      applied: 1,
      kept: 0,
      edited: 0,
      toFill: [
        {
          key: "summary",
          path: "summary",
          value: "A summary",
          reasons: ["not-proven"],
        },
        {
          key: "notes",
          path: "notes",
          value: "Hidden",
          reasons: ["not-proven", "hidden"],
        },
      ],
      toReplace: [
        {
          key: "slug",
          path: "slug",
          value: "about-us",
          reasons: ["replaces"],
          quote: "about-us",
        },
      ],
      unproven: [],
      unchanged: 0,
      manual: 1,
      discarded: 1,
      notFound: 1,
    });
  });

  it("lists a value with no quote at all in a group of its own", () => {
    const summary = summarizeMapoAiFill([
      entry("status", "confirm", filled("review", false, false)),
      entry("notes", "confirm", filled("Read twice", false, false), {
        shown: false,
      }),
    ]);

    expect(summary.toFill).toEqual([]);
    expect(summary.unproven).toEqual([
      {
        key: "status",
        path: "status",
        value: "review",
        reasons: ["not-proven"],
      },
      {
        key: "notes",
        path: "notes",
        value: "Read twice",
        reasons: ["not-proven", "hidden"],
      },
    ]);
  });

  it("lists a value that would replace one with what the field holds now, proven or not", () => {
    const summary = summarizeMapoAiFill([
      entry("title", "confirm", filled("Open data at ten", true), {
        replaces: true,
        current: "Building Admin UIs",
      }),
      // Nothing quoted: still a replacement first, never one apart.
      entry("reading_time", "confirm", filled("10", false, false), {
        replaces: true,
        current: 8,
      }),
    ]);

    expect(summary.toReplace).toEqual([
      {
        key: "title",
        path: "title",
        value: "Open data at ten",
        reasons: ["replaces"],
        quote: "Open data at ten",
        current: "Building Admin UIs",
      },
      {
        key: "reading_time",
        path: "reading_time",
        value: "10",
        reasons: ["not-proven", "replaces"],
        current: 8,
      },
    ]);
    expect(summary.unproven).toEqual([]);
  });

  it("gives the other languages a synci18n value would replace, for a replacement only", () => {
    const languages = { en: "who-we-are" };
    const summary = summarizeMapoAiFill([
      entry("slug", "confirm", filled("about-us", true), {
        replaces: true,
        current: "chi-siamo",
        languages,
      }),
      entry("title", "confirm", filled("About us", false), { languages }),
    ]);

    expect(summary.toReplace[0]).toMatchObject({
      current: "chi-siamo",
      languages: { en: "who-we-are" },
    });
    expect(summary.toFill[0]).not.toHaveProperty("languages");
  });

  it("gives what a field holds only for a value that would replace it", () => {
    const summary = summarizeMapoAiFill([
      entry("summary", "confirm", filled("A summary", false), { current: "" }),
    ]);

    expect(summary.toFill).toEqual([
      {
        key: "summary",
        path: "summary",
        value: "A summary",
        reasons: ["not-proven"],
      },
    ]);
  });

  it("counts a value the field already holds as unchanged, never as one that waits", () => {
    const summary = summarizeMapoAiFill([
      entry("slug", "unchanged", filled("about-us", true), {
        current: "about-us",
      }),
      entry("featured", "unchanged", filled("true", false, false)),
    ]);

    expect(summary).toMatchObject({
      unchanged: 2,
      toFill: [],
      toReplace: [],
      unproven: [],
    });
  });

  it("counts what the operator kept or changed as theirs, and leaves out what they ignored", () => {
    const summary = summarizeMapoAiFill([
      entry("title", "apply", filled("About us", true), {
        applied: true,
        review: "kept",
      }),
      entry("slug", "apply", filled("about-us", true), {
        applied: true,
        review: "edited",
      }),
      entry("excerpt", "apply", filled("Ours", true), {
        applied: true,
        review: "ignored",
      }),
      entry("summary", "confirm", filled("A summary", false), {
        review: "ignored",
      }),
    ]);

    expect(summary).toMatchObject({
      applied: 1,
      kept: 1,
      edited: 1,
      toFill: [],
      toReplace: [],
      unproven: [],
    });
  });

  it("counts as changed only a value the AI gave: a discarded one the operator wrote over stays discarded", () => {
    const summary = summarizeMapoAiFill([
      entry(
        "rating",
        "discard",
        { status: "discarded", reason: "too-high", proposed: 9, quotes: [] },
        { review: "edited" },
      ),
    ]);

    expect(summary).toMatchObject({ edited: 0, discarded: 1 });
  });

  it("says how many items of a list waiting are verified, and gives each, with the ones the field holds", () => {
    const list: AiFieldOutcome = {
      status: "filled",
      value: [{ name: "A" }, { _template: "hero", name: "B" }],
      verified: false,
      quotes: [{ quote: "A and B", where: "", found: false }],
      items: [
        { fields: {}, verified: true },
        { template: "hero", fields: {}, verified: false },
      ],
    };

    expect(
      summarizeMapoAiFill([
        entry("speakers", "confirm", list, {
          current: [{ name: "A", photo: 7 }],
        }),
      ]).toFill,
    ).toEqual([
      {
        key: "speakers",
        path: "speakers",
        value: [{ name: "A" }, { _template: "hero", name: "B" }],
        reasons: ["not-proven"],
        items: { total: 2, verified: 1 },
        // What its items join: the field's own.
        current: [{ name: "A", photo: 7 }],
        list: [
          { index: 0, value: { name: "A" }, verified: true, held: true },
          {
            index: 1,
            value: { _template: "hero", name: "B" },
            template: "hero",
            verified: false,
            held: false,
          },
        ],
      },
    ]);
  });
});

describe("mapoAiPreselectedItems", () => {
  const proposed = (index: number, verified: boolean, held: boolean) => ({
    index,
    value: { name: String(index) },
    verified,
    held,
  });

  it("ticks the verified items a list does not hold, and nothing of a hidden field", () => {
    const item = {
      key: "speakers",
      path: "speakers",
      value: [],
      reasons: ["not-proven" as const],
      list: [
        proposed(0, true, false),
        proposed(1, false, false),
        proposed(2, true, true),
      ],
    };

    expect(mapoAiPreselectedItems(item)).toEqual([0]);
    expect(
      mapoAiPreselectedItems({ ...item, reasons: ["not-proven", "hidden"] }),
    ).toEqual([]);
  });

  it("ticks a list only when it has an item to tick", () => {
    const list = (verified: boolean) => ({
      key: "speakers",
      path: "speakers",
      value: [],
      reasons: [] as MapoAiWaitReason[],
      list: [proposed(0, verified, false)],
    });
    const summary = (verified: boolean): MapoAiFillSummary => ({
      applied: 0,
      kept: 0,
      edited: 0,
      toFill: [list(verified)],
      toReplace: [],
      unproven: [],
      unchanged: 0,
      manual: 0,
      discarded: 0,
      notFound: 0,
    });

    expect(mapoAiPreselected(summary(true))).toEqual(["speakers"]);
    expect(mapoAiPreselected(summary(false))).toEqual([]);
  });
});

describe("mapoAiPreselected", () => {
  it("ticks the values for empty fields the form shows, proven or not, and never a replacement, a value with no quote at all or a hidden field", () => {
    const value = (path: string, reasons: MapoAiWaitReason[]) => ({
      key: path,
      path,
      value: path,
      reasons,
    });
    const summary: MapoAiFillSummary = {
      applied: 0,
      kept: 0,
      edited: 0,
      toFill: [
        value("summary", ["not-proven"]),
        value("notes", ["not-proven", "hidden"]),
        // The form was busy as the answer came: no reason, still to fill.
        value("excerpt", []),
      ],
      toReplace: [value("title", ["replaces"])],
      unproven: [value("slug", ["not-proven"])],
      unchanged: 0,
      manual: 0,
      discarded: 0,
      notFound: 0,
    };

    expect(mapoAiPreselected(summary)).toEqual(["summary", "excerpt"]);
  });
});

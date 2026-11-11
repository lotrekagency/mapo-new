import { describe, expect, it, vi } from "vitest";
import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import {
  MapoAiFillAnswerError,
  declaredKeys,
  deleteModelValue,
  isEmptyFormValue,
  isItemHeld,
  isItemList,
  isSafePath,
  mapoAiFillRequest,
  mapoAiValueText,
  planMapoAiFill,
  readMapoAiFillResponse,
  readModelValue,
  runMapoAiFill,
  undoModelWrite,
  verifiedItemsToAdd,
  writeModelValue,
} from "../runtime/shared/fill";
import type { MapoAiFillForm } from "../runtime/shared/fill";
import type { MapoAiRelationMatch } from "../runtime/shared/relations";
import type {
  AiFieldOutcome,
  AiFieldOutcomes,
  AiValue,
} from "../runtime/shared/sanitize";

const FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
];

/** A form whose model is `model`, each key at the path of the same name. */
function formOf(model: Record<string, unknown>): MapoAiFillForm {
  return {
    pathOf: (key) => key,
    read: (path) => readModelValue(model, path),
  };
}

/** A filled outcome, with a quote found when it is verified. */
function filled(value: AiValue, verified = true): AiFieldOutcome {
  return {
    status: "filled",
    value,
    verified,
    quotes: [{ quote: `Value: ${String(value)}`, where: "", found: verified }],
  };
}

/** An answer of `run` to a fill request, as the gateway writes it. */
function answered(fields: unknown): Record<string, unknown> {
  return {
    task: "fill",
    status: "answered",
    result: { readable: true, fields, warnings: [] },
    provider: { id: "mock", model: "mock" },
    prompt: 1,
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

describe("mapoAiFillRequest", () => {
  it("describes the record with the form's fields, and the backend's schema when given", () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" } },
    };

    const request = mapoAiFillRequest({
      fields: FIELDS,
      schema,
      source: "Title: About us",
    });

    expect(request).toEqual({
      task: "fill",
      entity: { fields: fieldsToJsonSchema(FIELDS), schema },
      existing: false,
      parts: [{ kind: "text", text: "Title: About us" }],
    });
  });

  it("sends the language, the provider and the operator's instructions, trimmed", () => {
    const request = mapoAiFillRequest({
      fields: FIELDS,
      source: "x",
      existing: true,
      language: "it",
      instructions: "  Only the first paragraph.  ",
      provider: { id: "mock", model: "mock" },
    });

    expect(request).toMatchObject({
      existing: true,
      language: "it",
      instructions: "Only the first paragraph.",
      provider: { id: "mock", model: "mock" },
    });
  });

  it("leaves out an empty language and blank instructions", () => {
    const request = mapoAiFillRequest({
      fields: FIELDS,
      source: "x",
      language: "",
      instructions: "   ",
    });

    expect(request).not.toHaveProperty("language");
    expect(request).not.toHaveProperty("instructions");
  });

  it("sends the entity's own facts and nothing else", () => {
    const entity = {
      label: "Article",
      model: "article",
      exclude: ["seo"],
      evidence: false,
      fields: { type: "object" },
      endpoint: "/api/articles/",
    };

    const request = mapoAiFillRequest({ fields: FIELDS, source: "x", entity });

    expect(request.entity).toEqual({
      label: "Article",
      model: "article",
      exclude: ["seo"],
      evidence: false,
      fields: fieldsToJsonSchema(FIELDS),
    });
  });

  it("writes the ai options of each descriptor as x-mapo-ai, inside a repeater's items too", () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "title", type: "text", ai: { hint: " The event's name. " } },
      { key: "notes", type: "textarea", ai: { exclude: true } },
      {
        key: "speakers",
        type: "repeater",
        fields: [
          {
            key: "person",
            type: "fks",
            attrs: { endpoint: "/api/people/" },
            ai: { list: false },
          },
        ],
      },
      { key: "slug", type: "text" },
    ];

    const { properties } = mapoAiFillRequest({ fields, source: "x" }).entity
      .fields as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(properties.title?.["x-mapo-ai"]).toEqual({
      hint: "The event's name.",
    });
    expect(properties.notes?.["x-mapo-ai"]).toEqual({ exclude: true });
    expect(properties.speakers).toMatchObject({
      items: { properties: { person: { "x-mapo-ai": { list: false } } } },
    });
    expect(properties.slug).not.toHaveProperty("x-mapo-ai");
  });

  it("leaves out an ai option that is not one", () => {
    const fields = [
      {
        key: "title",
        type: "text",
        ai: { hint: " ", exclude: "yes", list: true },
      },
    ] as unknown as AnyFieldDescriptor[];

    const { properties } = mapoAiFillRequest({ fields, source: "x" }).entity
      .fields as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(properties.title).not.toHaveProperty("x-mapo-ai");
  });

  it("sends the parts of a source as copies", () => {
    const parts = [{ kind: "text" as const, text: "One", name: "a.txt" }];

    const request = mapoAiFillRequest({ fields: FIELDS, source: parts });

    expect(request.parts).toEqual(parts);
    expect(request.parts[0]).not.toBe(parts[0]);
  });
});

describe("readMapoAiFillResponse", () => {
  it("reads an answer of run to a fill request", () => {
    const fields = {
      title: filled("About us"),
      excerpt: { status: "empty" },
      status: {
        status: "discarded",
        reason: "not-listed",
        proposed: "archived",
        quotes: [],
      },
    };

    const response = readMapoAiFillResponse(answered(fields));

    expect(response).toEqual(answered(fields));
  });

  it("reads a refusal", () => {
    const refusal = {
      task: "fill",
      status: "refused",
      refusal: "No.",
      provider: { id: "mock", model: "mock" },
      prompt: 1,
      usage: { inputTokens: 1, outputTokens: 1 },
    };

    expect(readMapoAiFillResponse(refusal)).toEqual(refusal);
  });

  it("keeps the counts of the prompt cache, and leaves out those that are no number", () => {
    const usage = {
      inputTokens: 300,
      outputTokens: 20,
      cacheReadTokens: 250,
      cacheWriteTokens: "50",
    };

    const response = readMapoAiFillResponse({ ...answered({}), usage });

    expect(response?.usage).toEqual({
      inputTokens: 300,
      outputTokens: 20,
      cacheReadTokens: 250,
    });
  });

  it("is no fill answer for an extraction, a missing provider or another status", () => {
    const fill = answered({});

    expect(
      readMapoAiFillResponse({ ...fill, task: "extract" }),
    ).toBeUndefined();
    expect(
      readMapoAiFillResponse({ ...fill, provider: "mock" }),
    ).toBeUndefined();
    expect(readMapoAiFillResponse({ ...fill, status: "done" })).toBeUndefined();
    expect(readMapoAiFillResponse({ ...fill, result: [] })).toBeUndefined();
    expect(readMapoAiFillResponse("ok")).toBeUndefined();
  });

  it("leaves out an outcome it cannot read, and keeps the others", () => {
    const fields = {
      title: filled("About us"),
      excerpt: {
        status: "filled",
        value: { html: "<p>x</p>" },
        verified: true,
        quotes: [],
      },
      body: { status: "filled", value: "x", verified: "yes", quotes: [] },
      status: {
        status: "discarded",
        reason: "made-up",
        proposed: 1,
        quotes: [],
      },
      summary: { status: "partial" },
    };

    const response = readMapoAiFillResponse(answered(fields));

    expect(response?.status === "answered" && response.result.fields).toEqual({
      title: filled("About us"),
    });
  });

  it("keeps a key such as __proto__ as data", () => {
    const fields = JSON.parse(
      '{"__proto__": {"status": "filled", "value": "x", "verified": true, "quotes": []}}',
    );

    const response = readMapoAiFillResponse(answered(fields));
    const outcomes =
      response?.status === "answered" ? response.result.fields : {};

    expect(Object.hasOwn(outcomes, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(outcomes)).toBe(Object.prototype);
  });

  it("reads the items of a list, and drops a list whose items it cannot read", () => {
    const list = {
      status: "filled",
      value: [{ name: "Ada" }],
      verified: true,
      quotes: [],
      items: [{ fields: { name: filled("Ada") }, verified: true }],
    };
    const broken = { ...list, items: [{ fields: {}, verified: "yes" }] };

    const response = readMapoAiFillResponse(
      answered({ speakers: list, guests: broken }),
    );

    expect(response?.status === "answered" && response.result.fields).toEqual({
      speakers: list,
    });
  });

  it("leaves out a list of items without the outcome of each item", () => {
    const value = [{ company: { search: "ACME" } }];
    const bare = { status: "filled", value, verified: true, quotes: [] };
    const short = { ...bare, items: [] };

    const response = readMapoAiFillResponse(
      answered({ speakers: bare, guests: short }),
    );

    expect(response?.status === "answered" && response.result.fields).toEqual(
      {},
    );
  });

  it("keeps only the warnings it can read", () => {
    const answer = answered({});
    const result = answer.result as Record<string, unknown>;
    result.warnings = [
      { kind: "unknown-property", path: "values.x" },
      { kind: "unknown-property" },
      { kind: "made-up", path: "x" },
    ];

    const response = readMapoAiFillResponse(answer);

    expect(response?.status === "answered" && response.result.warnings).toEqual(
      [{ kind: "unknown-property", path: "values.x" }],
    );
  });
});

describe("planMapoAiFill", () => {
  it("applies a verified value on an empty field", () => {
    const entries = planMapoAiFill({ title: filled("About us") }, formOf({}));

    expect(entries).toEqual([
      {
        key: "title",
        path: "title",
        action: "apply",
        replaces: false,
        shown: true,
        outcome: filled("About us"),
      },
    ]);
  });

  it("has the operator confirm a value no quote proves", () => {
    const [entry] = planMapoAiFill(
      { title: filled("About us", false) },
      formOf({}),
    );

    expect(entry).toMatchObject({ action: "confirm", replaces: false });
  });

  it("has the operator confirm a verified value that would replace one", () => {
    const [entry] = planMapoAiFill(
      { title: filled("About us") },
      formOf({ title: "Home" }),
    );

    expect(entry).toMatchObject({ action: "confirm", replaces: true });
  });

  it("has the operator confirm a value that goes into every language when any of them holds one", () => {
    const model = { translations: { en: {}, it: { slug: "chi-siamo" } } };
    const form: MapoAiFillForm = {
      ...formOf(model),
      pathsOf: () => ["translations.en.slug", "translations.it.slug"],
    };

    const [entry] = planMapoAiFill({ slug: filled("about-us") }, form);

    expect(entry).toMatchObject({ action: "confirm", replaces: true });
  });

  it("reads only the paths it can reach, never through a prototype", () => {
    const form: MapoAiFillForm = {
      ...formOf({}),
      read: (path) =>
        path === "__proto__.slug" ? "polluted" : readModelValue({}, path),
      pathsOf: () => ["__proto__.slug"],
    };

    const [entry] = planMapoAiFill({ slug: filled("about-us") }, form);

    expect(entry).toMatchObject({ action: "apply", replaces: false });
  });

  it("counts false and 0 as values, and blank texts and empty lists as none", () => {
    const outcomes: AiFieldOutcomes = {
      featured: filled(true),
      minutes: filled(5),
      body: filled("<p>x</p>"),
      tags: filled(["a"]),
      excerpt: filled("x"),
    };
    const model = {
      featured: false,
      minutes: 0,
      body: "<p></p>",
      tags: [],
      excerpt: "  ",
    };

    const actions = planMapoAiFill(outcomes, formOf(model)).map(
      (entry) => `${entry.key}:${entry.action}`,
    );

    expect(actions).toEqual([
      "featured:confirm",
      "minutes:confirm",
      "body:apply",
      "tags:apply",
      "excerpt:apply",
    ]);
  });

  it("leaves a related record for the operator to choose", () => {
    const outcomes: AiFieldOutcomes = {
      category: filled({ search: "News" }),
      tags: filled([{ id: 3 }]),
      speakers: {
        status: "filled",
        value: [{ company: { search: "ACME" } }],
        verified: true,
        quotes: [],
        items: [
          { fields: { company: filled({ search: "ACME" }) }, verified: true },
        ],
      },
    };

    const actions = planMapoAiFill(outcomes, formOf({})).map(
      (entry) => entry.action,
    );

    expect(actions).toEqual(["manual", "manual", "manual"]);
  });

  it("finds a related record anywhere in a value, whatever its items say", () => {
    const outcomes: AiFieldOutcomes = {
      speakers: {
        status: "filled",
        value: [{ company: { search: "ACME" } }],
        verified: true,
        quotes: [],
        items: [{ fields: { company: filled("ACME") }, verified: true }],
      },
    };

    const [entry] = planMapoAiFill(outcomes, formOf({}));

    expect(entry?.action).toBe("manual");
  });

  it("never puts a value by itself into a field the form hides", () => {
    const form: MapoAiFillForm = {
      ...formOf({}),
      isShown: (key) => key !== "external_url",
    };

    const entries = planMapoAiFill(
      { title: filled("A"), external_url: filled("https://example.com") },
      form,
    );

    expect(
      entries.map((entry) => [entry.key, entry.action, entry.shown]),
    ).toEqual([
      ["title", "apply", true],
      ["external_url", "confirm", false],
    ]);
  });

  it("leaves to the operator a part of a field the form cannot take as it is", () => {
    const form: MapoAiFillForm = {
      ...formOf({}),
      canTake: (key) => key !== "seo.title",
    };

    const [entry] = planMapoAiFill({ "seo.title": filled("About us") }, form);

    expect(entry?.action).toBe("manual");
  });

  it("applies a verified list whole, on an empty list", () => {
    const outcomes: AiFieldOutcomes = {
      speakers: {
        status: "filled",
        value: [{ name: "Ada" }],
        verified: true,
        quotes: [],
        items: [{ fields: { name: filled("Ada") }, verified: true }],
      },
    };

    const [entry] = planMapoAiFill(outcomes, formOf({ speakers: [] }));

    expect(entry).toMatchObject({ path: "speakers", action: "apply" });
  });

  it("discards what the gateway discarded, and says when the source gives nothing", () => {
    const outcomes: AiFieldOutcomes = {
      status: {
        status: "discarded",
        reason: "not-listed",
        proposed: "x",
        quotes: [],
      },
      excerpt: { status: "empty" },
    };

    const entries = planMapoAiFill(outcomes, formOf({ status: "draft" }));

    expect(entries.map((entry) => [entry.action, entry.replaces])).toEqual([
      ["discard", false],
      ["empty", false],
    ]);
  });

  it("leaves a value the form says it already holds unchanged: nothing to write, nor to replace", () => {
    const form: MapoAiFillForm = {
      ...formOf({ title: "About us", slug: "home" }),
      holds: (key, value) => key === "title" && value === "About us",
    };

    const entries = planMapoAiFill(
      { title: filled("About us", false), slug: filled("about-us") },
      form,
    );

    expect(entries.map((entry) => [entry.action, entry.replaces])).toEqual([
      ["unchanged", false],
      ["confirm", true],
    ]);
  });

  it("asks whether the form holds a value only of a field that holds one, for a value given", () => {
    const holds = vi.fn(() => true);
    const form: MapoAiFillForm = { ...formOf({ status: "draft" }), holds };

    const entries = planMapoAiFill(
      {
        title: filled("About us"),
        status: {
          status: "discarded",
          reason: "not-listed",
          proposed: "x",
          quotes: [],
        },
        excerpt: { status: "empty" },
      },
      form,
    );

    expect(entries.map((entry) => entry.action)).toEqual([
      "apply",
      "discard",
      "empty",
    ]);
    expect(holds).not.toHaveBeenCalled();
  });

  it("counts a related record the field already holds as unchanged, with nothing to find", () => {
    const form: MapoAiFillForm = {
      ...formOf({ category: { id: 3 } }),
      holds: () => true,
    };

    const [entry] = planMapoAiFill({ category: filled({ id: 3 }) }, form);

    expect(entry).toMatchObject({ action: "unchanged", replaces: false });
  });

  it("has the operator choose the items of a list for a field that holds some, which it never replaces", () => {
    const list: AiFieldOutcome = {
      status: "filled",
      value: [{ name: "Anna" }],
      verified: true,
      quotes: [],
      items: [{ fields: {}, verified: true }],
    };

    const [onItems] = planMapoAiFill(
      { speakers: list },
      formOf({ speakers: [{ name: "Luca" }] }),
    );
    const [onEmpty] = planMapoAiFill({ speakers: list }, formOf({}));

    // Verified, but the field holds items: they would join them, so it waits.
    expect(onItems).toMatchObject({ action: "confirm", replaces: false });
    expect(onEmpty).toMatchObject({ action: "apply", replaces: false });
  });

  it("leaves out a field the form does not have, or whose path leads to a prototype", () => {
    const form: MapoAiFillForm = {
      pathOf: (key) =>
        key === "title"
          ? "title"
          : key === "x"
            ? "__proto__.polluted"
            : undefined,
      read: () => undefined,
    };

    const entries = planMapoAiFill(
      { title: filled("A"), x: filled("B"), other: filled("C") },
      form,
    );

    expect(entries.map((entry) => entry.key)).toEqual(["title"]);
  });
});

describe("isEmptyFormValue", () => {
  it("is empty for no value, a blank text, an empty paragraph or an empty list", () => {
    for (const value of [
      undefined,
      null,
      "",
      "  ",
      "<p></p>",
      "<p> </p><br>",
      "<p><br></p>",
      "<p>&nbsp;</p>",
      [],
    ]) {
      expect(isEmptyFormValue(value)).toBe(true);
    }
  });

  it("is not empty for false, 0, a text or an object", () => {
    for (const value of [
      false,
      0,
      "x",
      "<p>x</p>",
      ["a"],
      { lat: 1, lng: 2 },
    ]) {
      expect(isEmptyFormValue(value)).toBe(false);
    }
  });
});

describe("the model", () => {
  it("writes at a path, making the objects on the way, and says what it made", () => {
    const model: Record<string, unknown> = {
      translations: { en: { title: "A" } },
      seo: null,
    };

    expect(writeModelValue(model, "translations.it.title", "B")).toEqual({
      existed: false,
      made: [{ path: "translations.it", wasNull: false }],
    });
    expect(writeModelValue(model, "seo.title", "C")).toEqual({
      existed: false,
      made: [{ path: "seo", wasNull: true }],
    });
    expect(writeModelValue(model, "translations.en.title", "D")).toEqual({
      existed: true,
      made: [],
    });
    expect(model).toEqual({
      translations: { en: { title: "D" }, it: { title: "B" } },
      seo: { title: "C" },
    });
  });

  it("undoes a write exactly: the key it added and the objects it made go away", () => {
    const original = { translations: { en: { title: "A" } }, seo: null };
    const model: Record<string, unknown> = structuredClone(original);
    const first = writeModelValue(model, "translations.it.title", "B");
    const second = writeModelValue(model, "seo.title", "C");
    const third = writeModelValue(model, "translations.en.title", "D");
    if (!first || !second || !third) throw new Error("Not written");

    undoModelWrite(model, "translations.en.title", third, "A");
    undoModelWrite(model, "seo.title", second, undefined);
    undoModelWrite(model, "translations.it.title", first, undefined);

    expect(model).toEqual(original);
    expect(Object.hasOwn(model.translations as object, "it")).toBe(false);
  });

  it("keeps an object it made when something else went into it", () => {
    const model: Record<string, unknown> = {};
    const write = writeModelValue(model, "translations.it.title", "B");
    if (!write) throw new Error("Not written");
    writeModelValue(model, "translations.it.subtitle", "Typed");

    undoModelWrite(model, "translations.it.title", write, undefined);

    expect(model).toEqual({ translations: { it: { subtitle: "Typed" } } });
  });

  it("never writes through a prototype", () => {
    const model: Record<string, unknown> = {};

    expect(writeModelValue(model, "__proto__.polluted", "x")).toBeUndefined();
    expect(
      writeModelValue(model, "constructor.prototype.polluted", "x"),
    ).toBeUndefined();
    expect(writeModelValue(model, "a..b", "x")).toBeUndefined();
    deleteModelValue(model, "__proto__.toString");

    expect(Object.prototype).not.toHaveProperty("polluted");
    expect(Object.prototype.toString).toBeTypeOf("function");
    expect(model).toEqual({});
  });

  it("writes nothing through a value that is no object", () => {
    const model: Record<string, unknown> = { seo: "plain" };

    expect(writeModelValue(model, "seo.title", "x")).toBeUndefined();
    expect(model).toEqual({ seo: "plain" });
  });

  it("reads own values only", () => {
    const model = { seo: { title: "A" } };

    expect(readModelValue(model, "seo.title")).toBe("A");
    expect(readModelValue(model, "seo.toString")).toBeUndefined();
    expect(readModelValue(model, "seo.title.length")).toBeUndefined();
  });

  it("names a path safe only when every segment names a value", () => {
    expect(isSafePath("translations.it.title")).toBe(true);
    expect(isSafePath("seo.__proto__")).toBe(false);
    expect(isSafePath("prototype")).toBe(false);
    expect(isSafePath("")).toBe(false);
  });

  it("tells the keys a form declares: each field, and the parts of an object", () => {
    const schema = fieldsToJsonSchema([
      { key: "title", type: "text", label: "Title" },
      { key: "seo", type: "seo", label: "SEO" },
      { key: "template_data.hero.title", type: "text", label: "Hero" },
      {
        key: "speakers",
        type: "repeater",
        label: "Speakers",
        attrs: { fields: [{ key: "name", type: "text", label: "Name" }] },
      },
    ]);

    const keys = declaredKeys(schema);

    expect(keys).toContain("title");
    expect(keys).toContain("seo.title");
    expect(keys).toContain("template_data.hero.title");
    expect(keys).toContain("speakers");
    expect(keys).not.toContain("title.x");
    expect(keys).not.toContain("speakers.length");
    expect(keys).not.toContain("speakers.0.name");
  });
});

describe("runMapoAiFill", () => {
  it("posts the request to run, and plans the answer against the form as it is then", async () => {
    const model: Record<string, unknown> = {};
    const signal = new AbortController().signal;
    const post = vi.fn(async () => {
      // The operator types while the AI answers.
      model.excerpt = "Typed meanwhile";
      return answered({ title: filled("About us"), excerpt: filled("Ours") });
    });

    const answer = await runMapoAiFill(
      {
        fields: FIELDS,
        source: "Title: About us",
        form: formOf(model),
        signal,
      },
      { post },
    );

    expect(post).toHaveBeenCalledWith(
      "/_mapo/ai/run",
      mapoAiFillRequest({ fields: FIELDS, source: "Title: About us" }),
      { signal },
    );
    expect(answer.entries.map((entry) => entry.action)).toEqual([
      "apply",
      "confirm",
    ]);
  });

  it("plans nothing for a refusal", async () => {
    const post = async () => ({
      task: "fill",
      status: "refused",
      refusal: "No.",
      provider: { id: "mock", model: "mock" },
      prompt: 1,
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const answer = await runMapoAiFill(
      { fields: FIELDS, source: "x", form: formOf({}) },
      { post },
    );

    expect(answer.response.status).toBe("refused");
    expect(answer.entries).toEqual([]);
  });

  it("throws on an answer it cannot read", async () => {
    const post = async () => ({ ok: true });

    await expect(
      runMapoAiFill(
        { fields: FIELDS, source: "x", form: formOf({}) },
        { post },
      ),
    ).rejects.toBeInstanceOf(MapoAiFillAnswerError);
  });

  it("lets the rejection of post through", async () => {
    const failure = new Error("Too many requests");
    const post = async () => {
      throw failure;
    };

    await expect(
      runMapoAiFill(
        { fields: FIELDS, source: "x", form: formOf({}) },
        { post },
      ),
    ).rejects.toBe(failure);
  });
});

describe("mapoAiValueText", () => {
  it("writes a value as plain text for the operator", () => {
    expect(mapoAiValueText("<p>One <strong>two</strong></p>")).toBe("One two");
    expect(mapoAiValueText(12.5)).toBe("12.5");
    expect(mapoAiValueText(false)).toBe("false");
    expect(mapoAiValueText({ search: "News" })).toBe("News");
    expect(mapoAiValueText({ id: 3 })).toBe("3");
    expect(mapoAiValueText({ lat: 45.46, lng: 9.19 })).toBe("45.46, 9.19");
    expect(mapoAiValueText(["a", "b"])).toBe("a, b");
  });

  it("has no text for a list of items, and cuts a long text", () => {
    expect(mapoAiValueText([{ name: "Ada" }])).toBe("");
    expect(mapoAiValueText("x".repeat(10), 5)).toBe("xxxx…");
  });
});

describe("the items of a list", () => {
  it("tells a list of items from a list of single values", () => {
    const items: AiFieldOutcome = {
      status: "filled",
      value: [{ name: "Anna" }],
      verified: true,
      quotes: [],
      items: [{ fields: {}, verified: true }],
    };

    expect(isItemList(items)).toBe(true);
    expect(isItemList(filled(["a", "b"]))).toBe(false);
    expect(isItemList({ status: "empty" })).toBe(false);
  });

  it("finds an item among the field's own by every value it gives, whatever else they hold", () => {
    const held = [
      { name: "Anna", role: "Chair", photo: 7 },
      { _template: "hero", title: "Welcome" },
    ];

    expect(isItemHeld({ name: "Anna", role: "Chair" }, held)).toBe(true);
    expect(isItemHeld({ _template: "hero", title: "Welcome" }, held)).toBe(
      true,
    );
    expect(isItemHeld({ name: "Anna", role: "Speaker" }, held)).toBe(false);
    expect(isItemHeld({ _template: "text", title: "Welcome" }, held)).toBe(
      false,
    );
    expect(isItemHeld({ name: "Anna" }, undefined)).toBe(false);
    expect(isItemHeld("Anna", ["Anna"])).toBe(false);
  });

  it("finds an item by what it holds at every depth: keys in any order, ids of the record's own", () => {
    // A block of the record, as the backend gives it back: its questions
    // with ids, their keys in the serializer's order, one more question.
    const held = [
      {
        _template: "faq",
        heading: "Questions",
        image: null,
        questions: [
          { id: 3, answer: "No, entry is free.", question: "A card?" },
          { id: 4, answer: "Yes.", question: "On Sundays?" },
        ],
      },
    ];
    const faq = (questions: Record<string, unknown>[]) => ({
      _template: "faq",
      heading: "Questions",
      questions,
    });

    expect(
      isItemHeld(faq([{ question: "On Sundays?", answer: "Yes." }]), held),
    ).toBe(true);
    expect(
      isItemHeld(
        faq([{ question: "A card?", answer: "Yes, a free one." }]),
        held,
      ),
    ).toBe(false);
    expect(isItemHeld(faq([{ question: "Parking?" }]), held)).toBe(false);
  });

  it("adds by default the verified items the field does not hold, by their place", () => {
    const list: AiFieldOutcome = {
      status: "filled",
      value: [{ name: "Anna" }, { name: "Marco" }, { name: "Paola" }],
      verified: false,
      quotes: [],
      items: [
        { fields: {}, verified: true },
        { fields: {}, verified: false },
        { fields: {}, verified: true },
      ],
    };

    expect(verifiedItemsToAdd(list, [{ name: "Paola", photo: 1 }])).toEqual([
      0,
    ]);
    expect(verifiedItemsToAdd(filled("x"), [])).toEqual([]);
  });
});

describe("planMapoAiFill — related records", () => {
  const found = (
    at: string,
    id: number,
    renamed = false,
  ): MapoAiRelationMatch => ({
    at,
    name: `Name ${id}`,
    status: "found",
    id,
    value: id,
    label: `Name ${id}`,
    ...(renamed ? { renamed: true } : {}),
  });
  const ambiguous = (at: string): MapoAiRelationMatch => ({
    at,
    name: "Open",
    status: "ambiguous",
    count: 2,
    candidates: [
      { id: 1, value: 1, label: "Open data" },
      { id: 2, value: 2, label: "Open source" },
    ],
  });

  it("applies a record found with the AI's name on an empty field, as any verified value", () => {
    const [entry] = planMapoAiFill(
      { category: filled({ search: "Name 2" }) },
      formOf({}),
      { category: [found("", 2)] },
    );

    expect(entry).toMatchObject({ action: "apply", replaces: false });
    expect(entry?.relations).toEqual([found("", 2)]);
  });

  it("has the operator confirm a record found under another name, never by itself", () => {
    const [entry] = planMapoAiFill(
      { category: filled({ search: "Culture" }) },
      formOf({}),
      { category: [found("", 5, true)] },
    );

    expect(entry?.action).toBe("confirm");
  });

  it("leaves to the operator a record several records match, or none, with what was found", () => {
    const entries = planMapoAiFill(
      { category: filled({ search: "Open" }), author: filled({ search: "X" }) },
      formOf({}),
      {
        category: [ambiguous("")],
        author: [{ at: "", name: "X", status: "none" }],
      },
    );

    expect(entries.map((entry) => entry.action)).toEqual(["manual", "manual"]);
    expect(entries[0]?.relations).toEqual([ambiguous("")]);
  });

  it("has a record found replace another only through the operator, and finds the same one unchanged", () => {
    const holds = vi.fn((key: string, value: unknown) => value === 3);
    const form: MapoAiFillForm = {
      ...formOf({ category: 2, other: 3 }),
      holds,
    };

    const [replaced, same] = planMapoAiFill(
      { category: filled({ search: "A" }), other: filled({ search: "B" }) },
      form,
      { category: [found("", 4)], other: [found("", 3)] },
    );

    expect(replaced).toMatchObject({ action: "confirm", replaces: true });
    expect(same).toMatchObject({ action: "unchanged", replaces: false });
    // The form is asked with the value the field would take: the record.
    expect(holds).toHaveBeenCalledWith("other", 3);
  });

  it("joins a list of records to the field's own, never replacing them, and applies it whole only when every record was found", () => {
    const refs = [{ search: "A" }, { search: "B" }];
    const [whole] = planMapoAiFill({ tags: filled(refs) }, formOf({}), {
      tags: [found("0", 1), found("1", 2)],
    });
    const [part] = planMapoAiFill({ tags: filled(refs) }, formOf({}), {
      tags: [found("0", 1), ambiguous("1")],
    });
    const [held] = planMapoAiFill(
      { tags: filled(refs) },
      formOf({ tags: [9] }),
      {
        tags: [found("0", 1), found("1", 2)],
      },
    );
    const [nothing] = planMapoAiFill({ tags: filled(refs) }, formOf({}), {
      tags: [ambiguous("0"), { at: "1", name: "B", status: "none" }],
    });

    expect(whole?.action).toBe("apply");
    expect(part).toMatchObject({ action: "confirm", replaces: false });
    expect(held).toMatchObject({ action: "confirm", replaces: false });
    expect(nothing?.action).toBe("manual");
  });

  it("applies a list of items whole only when every record its items name was found, and lets the operator choose them otherwise", () => {
    const blocks: AiFieldOutcome = {
      status: "filled",
      value: [{ article: { search: "A" } }, { article: { search: "Open" } }],
      verified: true,
      quotes: [],
      items: [
        { fields: { article: filled({ search: "A" }) }, verified: true },
        { fields: { article: filled({ search: "Open" }) }, verified: true },
      ],
    };

    const [ready] = planMapoAiFill({ blocks }, formOf({}), {
      blocks: [found("0.article", 1), found("1.article", 2)],
    });
    const [waiting] = planMapoAiFill({ blocks }, formOf({}), {
      blocks: [found("0.article", 1), ambiguous("1.article")],
    });

    expect(ready?.action).toBe("apply");
    expect(waiting?.action).toBe("confirm");
    expect(
      verifiedItemsToAdd(
        blocks,
        [],
        [found("0.article", 1), ambiguous("1.article")],
      ),
    ).toEqual([0]);
    expect(
      verifiedItemsToAdd(
        blocks,
        [{ article: 1 }],
        [found("0.article", 1), { ...ambiguous("1.article"), choice: 1 }],
      ),
    ).toEqual([1]);
  });
});

describe("runMapoAiFill — related records", () => {
  type PostOf = (
    path: string,
    body: unknown,
    options: { signal?: AbortSignal },
  ) => Promise<unknown>;

  const CATEGORY_FIELDS: AnyFieldDescriptor[] = [
    {
      key: "category",
      type: "fks",
      label: "Category",
      attrs: { endpoint: "/api/categories", returnObject: false },
    },
    {
      key: "author",
      type: "fks",
      label: "Author",
      attrs: { endpoint: "/api/authors", itemText: "username" },
    },
  ];

  it("lists the few records of a relation before the call, and searches a name after the answer", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/api/categories") return [{ id: 2, name: "Culture" }];
      if (path === "/api/authors")
        return { count: 80, next: "/p2", results: [] };
      if (path === "/api/authors?search=anna")
        return [{ id: 9, username: "anna" }];
      throw new Error(path);
    });
    const post = vi.fn<PostOf>(async () =>
      answered({
        category: filled({ id: 2 }),
        author: filled({ search: "anna" }),
      }),
    );

    const answer = await runMapoAiFill(
      { fields: CATEGORY_FIELDS, source: "x", form: formOf({}) },
      { post, get },
    );

    const body = post.mock.calls[0]?.[1] as { entity: Record<string, unknown> };
    expect(body.entity.relationChoices).toEqual({
      category: [{ value: 2, label: "Culture" }],
    });
    expect(answer.lists.records).toEqual({
      category: [{ id: 2, name: "Culture" }],
    });
    expect(answer.entries.map((entry) => [entry.key, entry.action])).toEqual([
      ["category", "apply"],
      ["author", "apply"],
    ]);
    expect(answer.entries[1]?.relations?.[0]).toMatchObject({
      value: { id: 9, username: "anna" },
      label: "anna",
    });
  });

  it("keeps the page's own records of a relation, and leaves relations alone without get", async () => {
    const get = vi.fn(async () => [{ id: 2, name: "Culture" }]);
    const post = vi.fn<PostOf>(async () =>
      answered({ category: filled({ id: 7 }) }),
    );
    const entity = {
      relationChoices: { category: [{ value: 7, label: "Sport" }] },
    };

    await runMapoAiFill(
      {
        fields: CATEGORY_FIELDS.slice(0, 1),
        source: "x",
        form: formOf({}),
        entity,
      },
      { post, get },
    );
    const body = post.mock.calls[0]?.[1] as { entity: Record<string, unknown> };
    expect(get).not.toHaveBeenCalled();
    expect(body.entity.relationChoices).toEqual(entity.relationChoices);

    const without = await runMapoAiFill(
      { fields: CATEGORY_FIELDS.slice(0, 1), source: "x", form: formOf({}) },
      { post },
    );
    expect(without.entries[0]?.action).toBe("manual");
  });

  it("never lists a relation with list: false, and searches the name the AI writes", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/api/categories?search=Culture")
        return [{ id: 2, name: "Culture" }];
      throw new Error(path);
    });
    const post = vi.fn<PostOf>(async () =>
      answered({ category: filled({ search: "Culture" }) }),
    );
    const fields: AnyFieldDescriptor[] = [
      { ...CATEGORY_FIELDS[0]!, ai: { list: false } },
    ];

    const answer = await runMapoAiFill(
      { fields, source: "x", form: formOf({}) },
      { post, get },
    );

    const body = post.mock.calls[0]?.[1] as { entity: Record<string, unknown> };
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/api/categories?search=Culture",
    ]);
    expect(body.entity).not.toHaveProperty("relationChoices");
    expect(answer.entries[0]?.relations?.[0]).toMatchObject({
      status: "found",
      value: 2,
    });
  });

  it("never lists a relation the backend's schema keeps unlisted, nor one kept from the AI", async () => {
    const get = vi.fn(async (path: string) => {
      throw new Error(path);
    });
    const post = vi.fn<PostOf>(async () => answered({}));
    const schema = {
      type: "object",
      properties: {
        category: { type: "integer", "x-mapo-ai": { list: false } },
      },
    };
    const fields: AnyFieldDescriptor[] = [
      CATEGORY_FIELDS[0]!,
      { ...CATEGORY_FIELDS[1]!, ai: { exclude: true } },
    ];

    await runMapoAiFill(
      { fields, schema, source: "x", form: formOf({}) },
      { post, get },
    );

    expect(get).not.toHaveBeenCalled();
    const body = post.mock.calls[0]?.[1] as { entity: Record<string, unknown> };
    expect(body.entity).not.toHaveProperty("relationChoices");
  });
});

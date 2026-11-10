import { describe, expect, it, vi } from "vitest";
import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import {
  MapoAiFillAnswerError,
  declaredKeys,
  deleteModelValue,
  isEmptyFormValue,
  isSafePath,
  mapoAiFillRequest,
  mapoAiValueText,
  planMapoAiFill,
  readMapoAiFillResponse,
  readModelValue,
  runMapoAiFill,
  undoModelWrite,
  writeModelValue,
} from "../runtime/shared/fill";
import type { MapoAiFillForm } from "../runtime/shared/fill";
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

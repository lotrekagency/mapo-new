import { describe, expect, it } from "vitest";
import type { AiEntity, AiField, AiValueKind } from "../runtime/shared/entity";
import {
  compileExtractContract,
  compileFillContract,
} from "../runtime/shared/contract";
import type {
  AiContractSource,
  AiFillContract,
} from "../runtime/shared/contract";
import {
  DEFAULT_VERIFICATION_RULES,
  sanitizeExtractAnswer,
  sanitizeFillAnswer,
  verificationRulesOf,
} from "../runtime/shared/sanitize";
import type {
  AiFieldOutcome,
  AiFillResult,
  AiVerificationRules,
} from "../runtime/shared/sanitize";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function aiField(
  key: string,
  kind: AiValueKind = "string",
  extra: Partial<AiField> = {},
): AiField {
  return {
    key,
    fieldType: "custom",
    kind,
    required: false,
    translatable: false,
    multiple: false,
    constraints: {},
    ...extra,
  };
}

function modelOf(fields: AiField[]): AiEntity {
  return {
    sources: { schema: false, fields: true },
    fields,
    skipped: [],
    warnings: [],
  };
}

function fill(
  fields: AiField[],
  source: Partial<AiContractSource> = {},
): AiFillContract {
  return compileFillContract({ entity: modelOf(fields), ...source });
}

/** An empty answer for every field of the contract, as a strict provider writes it. */
function blankValues(contract: AiFillContract): Record<string, unknown> {
  return Object.fromEntries(
    contract.entity.fields.map((field) => [
      field.wire,
      field.multiple ? [] : field.linksTo ? { record: "", item: "" } : "",
    ]),
  );
}

function answer(
  contract: AiFillContract,
  values: Record<string, unknown>,
  evidence: unknown[] = [],
) {
  return { values: { ...blankValues(contract), ...values }, evidence };
}

function sanitizeOne(
  field: AiField,
  raw: unknown,
  source?: string,
  evidence: unknown[] = [],
  rules?: Partial<AiVerificationRules>,
): { outcome: AiFieldOutcome | undefined; result: AiFillResult } {
  const contract = fill([field]);
  const result = sanitizeFillAnswer(
    contract,
    answer(contract, { [field.key]: raw }, evidence),
    {
      ...(source !== undefined ? { source } : {}),
      ...(rules ? { rules } : {}),
    },
  );
  return { outcome: result.fields[field.key], result };
}

function valueOf(outcome: AiFieldOutcome | undefined): unknown {
  return outcome?.status === "filled" ? outcome.value : undefined;
}

function reasonOf(outcome: AiFieldOutcome | undefined): string | undefined {
  return outcome?.status === "discarded" ? outcome.reason : undefined;
}

const levels = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Published" },
];

// ─── Values of each kind ─────────────────────────────────────────────────────

describe("sanitizeFillAnswer — values of each kind", () => {
  it.each<[string, AiValueKind, string, unknown]>([
    ["text on one line", "string", "  Riapre il\nTeatro  ", "Riapre il Teatro"],
    ["text with line breaks", "text", "Riga 1\r\nRiga 2 ", "Riga 1\nRiga 2"],
    [
      "rich text, as HTML",
      "html",
      "**Ciao** a tutti",
      "<p><strong>Ciao</strong> a tutti</p>",
    ],
    ["an email", "email", "info@teatro.it", "info@teatro.it"],
    [
      "a web address",
      "url",
      "https://teatro.it/stagione",
      "https://teatro.it/stagione",
    ],
    ["a colour", "color", "#FF8800", "#FF8800"],
    ["a whole number", "integer", "1200", 1200],
    ["a negative whole number", "integer", "-3", -3],
    ["a number", "number", "12.5", 12.5],
    ["yes", "boolean", "true", true],
    ["no", "boolean", "False", false],
    ["a date", "date", "2026-03-12", "2026-03-12"],
    [
      "a datetime without seconds",
      "datetime",
      "2026-03-12T21:00",
      "2026-03-12T21:00:00",
    ],
    [
      "a datetime with an offset",
      "datetime",
      "2026-03-12T21:00:00+01:00",
      "2026-03-12T21:00:00+01:00",
    ],
    [
      "a datetime in UTC",
      "datetime",
      "2026-03-12t21:00z",
      "2026-03-12T21:00:00Z",
    ],
    ["a time with one digit", "time", "9:30", "09:30"],
    ["a time with seconds", "time", "21:00:15", "21:00:15"],
    [
      "an address on localhost",
      "url",
      "http://localhost:3000/a",
      "http://localhost:3000/a",
    ],
    [
      "an email at the end of a sentence",
      "email",
      "info@teatro.it.",
      "info@teatro.it",
    ],
    [
      "an email in angle brackets",
      "email",
      "<info@teatro.it>",
      "info@teatro.it",
    ],
    [
      "a point of a map",
      "coordinates",
      "45.4642, 9.1900",
      { lat: 45.4642, lng: 9.19 },
    ],
    ["text without control characters", "string", "a\u0000b\u0007c", "abc"],
    ["text keeping its line breaks", "text", "a\u0000\nb", "a\nb"],
  ])("reads %s", (_case, kind, raw, value) => {
    expect(valueOf(sanitizeOne(aiField("value", kind), raw).outcome)).toEqual(
      value,
    );
  });

  it.each<[string, AiValueKind, unknown]>([
    ["an email without a domain", "email", "info@"],
    ["a javascript: address", "url", "javascript:alert(1)"],
    ["an address without a scheme", "url", "teatro.it"],
    ["a colour by name", "color", "red"],
    ["a number with a thousands separator", "integer", "1.200"],
    ["a decimal as a whole number", "integer", "12.5"],
    ["a decimal comma", "number", "12,5"],
    ["a word for yes", "boolean", "yes"],
    ["a day that does not exist", "date", "2026-02-30"],
    ["a month without a day", "date", "2026-03"],
    ["an hour that does not exist", "datetime", "2026-03-12T25:00"],
    ["midnight as 24:00", "time", "24:00"],
    ["an address without a dotted host", "url", "https://teatro"],
    ["an address with a space", "url", "https://teatro.it/la stagione"],
    ["an address with a line break", "url", "https://teatro.it/\nstagione"],
    ["an address with a backslash", "url", "https://teatro.it\\stagione"],
    ["an email without a top level", "email", "a@b.c"],
    ["an email with an empty label", "email", "info@teatro..it"],
    ["an offset that does not exist", "datetime", "2026-03-12T21:00:00+25:99"],
    ["a point off the globe", "coordinates", "95.1, 9.19"],
    ["a point with hemisphere letters", "coordinates", "45.46 N, 9.19 E"],
    ["a number for a text", "string", 12],
    ["an object for a text", "string", { text: "x" }],
  ])("discards %s as a wrong format", (_case, kind, raw) => {
    const { outcome } = sanitizeOne(aiField("value", kind), raw);

    expect(outcome).toMatchObject({
      status: "discarded",
      reason: "format",
      proposed: raw,
    });
  });

  it.each(["", "   ", "\n"])("reads %j as empty", (raw) => {
    expect(sanitizeOne(aiField("value"), raw).outcome).toEqual({
      status: "empty",
    });
  });

  it("gives rich text that turns into nothing as empty", () => {
    expect(sanitizeOne(aiField("body", "html"), "\n\n").outcome).toEqual({
      status: "empty",
    });
  });

  it("maps a choice back to the value the record saves", () => {
    const numbered = aiField("rank", "choice", {
      choices: [
        { value: 1, label: "One" },
        { value: true, label: "Yes" },
      ],
    });
    const field = aiField("status", "choice", { choices: levels });

    expect(valueOf(sanitizeOne(numbered, "1").outcome)).toBe(1);
    expect(valueOf(sanitizeOne(numbered, "true").outcome)).toBe(true);
    expect(valueOf(sanitizeOne(field, "live").outcome)).toBe("live");
    expect(reasonOf(sanitizeOne(field, "Published").outcome)).toBe(
      "not-listed",
    );
  });

  it("matches a choice written with the spaces of its value", () => {
    const field = aiField("code", "choice", {
      choices: [{ value: " A", label: "Spaced" }],
    });

    expect(valueOf(sanitizeOne(field, " A").outcome)).toBe(" A");
    expect(valueOf(sanitizeOne(field, "A").outcome)).toBe(" A");
  });

  it("discards a value of a kind this version does not know", () => {
    const field = aiField("stars", "rating" as unknown as AiValueKind);

    expect(reasonOf(sanitizeOne(field, "5").outcome)).toBe("format");
  });

  it("checks a choice the schema could not list", () => {
    const many = Array.from({ length: 300 }, (_, index) => ({
      value: `c${index}`,
      label: `C ${index}`,
    }));
    const field = aiField("pick", "choice", { choices: many });

    expect(fill([field]).entity.fields[0]?.choicesInSchema).toBe(false);
    expect(valueOf(sanitizeOne(field, "c299").outcome)).toBe("c299");
    expect(reasonOf(sanitizeOne(field, "c300").outcome)).toBe("not-listed");
  });
});

// ─── Limits ──────────────────────────────────────────────────────────────────

describe("sanitizeFillAnswer — limits", () => {
  it.each<[string, AiField, unknown, string]>([
    [
      "text too long",
      aiField("t", "string", { constraints: { maxLength: 5 } }),
      "abcdef",
      "too-long",
    ],
    [
      "text too short",
      aiField("t", "string", { constraints: { minLength: 3 } }),
      "ab",
      "too-short",
    ],
    [
      "text off its pattern",
      aiField("t", "string", { constraints: { patterns: ["^[A-Z]"] } }),
      "abc",
      "pattern",
    ],
    [
      "a number too low",
      aiField("n", "integer", { constraints: { minimum: 1 } }),
      "0",
      "too-low",
    ],
    [
      "a number too high",
      aiField("n", "integer", { constraints: { maximum: 120 } }),
      "121",
      "too-high",
    ],
    [
      "a number on the exclusive minimum",
      aiField("n", "number", { constraints: { exclusiveMinimum: 0 } }),
      "0",
      "too-low",
    ],
    [
      "a number on the exclusive maximum",
      aiField("n", "number", { constraints: { exclusiveMaximum: 10 } }),
      "10",
      "too-high",
    ],
    [
      "a large number off a decimal step",
      aiField("n", "number", { constraints: { steps: [0.01] } }),
      "12345678.123",
      "step",
    ],
    [
      "a very large number off its step",
      aiField("n", "number", { constraints: { steps: [0.5] } }),
      "600000000.3",
      "step",
    ],
    [
      "a number off a tiny step",
      aiField("n", "number", { constraints: { steps: [1e-8] } }),
      "12.123456789",
      "step",
    ],
    [
      "a number off its step",
      aiField("n", "number", { constraints: { steps: [0.01] } }),
      "12.345",
      "step",
    ],
  ])("discards %s", (_case, field, raw, reason) => {
    expect(reasonOf(sanitizeOne(field, raw).outcome)).toBe(reason);
  });

  it.each<[string, AiField, unknown]>([
    [
      "characters, not UTF-16 units",
      aiField("t", "string", { constraints: { maxLength: 3 } }),
      "\u{1F600}\u{1F600}\u{1F600}",
    ],
    [
      "a number on its step, despite rounding",
      aiField("n", "number", { constraints: { steps: [0.1] } }),
      "0.3",
    ],
    [
      "a number on two steps",
      aiField("n", "number", { constraints: { steps: [0.5, 0.25] } }),
      "1.5",
    ],
    [
      "the inclusive limits",
      aiField("n", "integer", { constraints: { minimum: 1, maximum: 1 } }),
      "1",
    ],
  ])("keeps %s", (_case, field, raw) => {
    expect(sanitizeOne(field, raw).outcome?.status).toBe("filled");
  });

  it("measures rich text on the HTML it becomes", () => {
    const field = aiField("body", "html", { constraints: { maxLength: 20 } });

    // "**ab**" is 6 characters, "<p><strong>ab</strong></p>" 26.
    expect(reasonOf(sanitizeOne(field, "**ab**").outcome)).toBe("too-long");
  });

  it("applies a pattern on rich text to the HTML", () => {
    const field = aiField("body", "html", {
      constraints: { patterns: ["^<p>"] },
    });

    expect(sanitizeOne(field, "Ciao").outcome?.status).toBe("filled");
  });

  it("does not apply the limits of a relation's key to its ids", () => {
    const field = aiField("place", "relation", {
      endpoint: "/api/places/",
      constraints: { maxLength: 1, patterns: ["^[a-z]+$"] },
    });
    const contract = fill([field], {
      relationChoices: { place: [{ value: 12, label: "Rome" }] },
    });
    const result = sanitizeFillAnswer(
      contract,
      answer(contract, { place: "12" }),
    );

    expect(valueOf(result.fields.place)).toEqual({ id: 12 });
  });

  it("skips a pattern JavaScript cannot read, and says so once", () => {
    const field = aiField("tags", "string", {
      multiple: true,
      constraints: { patterns: ["(unclosed"] },
    });
    const { outcome, result } = sanitizeOne(field, ["a", "b"]);

    expect(valueOf(outcome)).toEqual(["a", "b"]);
    expect(result.warnings).toEqual([
      { kind: "unreadable-pattern", key: "tags", pattern: "(unclosed" },
    ]);
  });
});

// ─── Lists ───────────────────────────────────────────────────────────────────

describe("sanitizeFillAnswer — lists", () => {
  const tags = aiField("tags", "choice", {
    multiple: true,
    choices: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  });

  it("keeps each value once", () => {
    expect(valueOf(sanitizeOne(tags, ["a", "b", "a"]).outcome)).toEqual([
      "a",
      "b",
    ]);
  });

  it("takes out a value that breaks a rule, keeps the rest for review", () => {
    expect(sanitizeOne(tags, ["a", "x"]).outcome).toEqual({
      status: "filled",
      value: ["a"],
      verified: false,
      quotes: [],
      dropped: [{ proposed: "x", reason: "not-listed" }],
    });
  });

  it("discards a list whose every value breaks a rule", () => {
    expect(sanitizeOne(tags, ["x", "y"]).outcome).toMatchObject({
      status: "discarded",
      reason: "not-listed",
      proposed: ["x", "y"],
    });
  });

  it("discards a list longer than allowed", () => {
    const short = { ...tags, constraints: { maxItems: 1 } };

    expect(reasonOf(sanitizeOne(short, ["a", "b"]).outcome)).toBe(
      "too-many-values",
    );
  });

  it("keeps a list shorter than needed, for review", () => {
    const long = { ...tags, constraints: { minItems: 2 } };
    const source = "Tag: A.";
    const evidence = [{ field: "tags", quote: "Tag: A", where: "" }];

    expect(sanitizeOne(long, ["a"], source, evidence).outcome).toMatchObject({
      status: "filled",
      value: ["a"],
      verified: false,
      tooFew: true,
    });
  });

  it("reads an empty list as empty, and a list that is not one as a wrong format", () => {
    expect(sanitizeOne(tags, []).outcome).toEqual({ status: "empty" });
    expect(sanitizeOne(tags, ["", " "]).outcome).toEqual({ status: "empty" });
    expect(reasonOf(sanitizeOne(tags, "a").outcome)).toBe("format");
  });
});

// ─── Relations ───────────────────────────────────────────────────────────────

describe("sanitizeFillAnswer — relations", () => {
  const place = aiField("place", "relation", { endpoint: "/api/places/" });
  const speakers = aiField("speakers", "relation", {
    endpoint: "/api/people/",
    multiple: true,
  });
  const records = {
    place: [
      { value: 12, label: "Rome" },
      { value: "15", label: "Milan" },
    ],
  };

  it("reads a listed record by its id, of its own type", () => {
    const contract = fill([place], { relationChoices: records });
    const read = (raw: string) =>
      sanitizeFillAnswer(contract, answer(contract, { place: raw })).fields
        .place;

    expect(valueOf(read("12"))).toEqual({ id: 12 });
    expect(valueOf(read("15"))).toEqual({ id: "15" });
    expect(reasonOf(read("99"))).toBe("not-listed");
  });

  it("reads a name to search for, one per related record", () => {
    const contract = fill([place, speakers]);
    const result = sanitizeFillAnswer(
      contract,
      answer(contract, {
        place: " Teatro\nVerdi ",
        speakers: ["Anna Rossi", "Luca Bianchi", "Anna Rossi"],
      }),
    );

    expect(valueOf(result.fields.place)).toEqual({ search: "Teatro Verdi" });
    expect(valueOf(result.fields.speakers)).toEqual([
      { search: "Anna Rossi" },
      { search: "Luca Bianchi" },
    ]);
  });
});

// ─── Quotes ──────────────────────────────────────────────────────────────────

describe("sanitizeFillAnswer — quotes", () => {
  const source = [
    "Comunicato stampa – 14 ottobre 2026.",
    "Dopo due anni di lavori riapre il Teatro Verdi di Pisa, con 1.200 posti.",
    "La stagione inaugurale partirà a marzo. Categoria: Cultura.",
    "Biglietti: 1200 in vendita, ridotto 12,5 euro. Info: info@teatroverdi.it.",
  ].join("\n");
  const quote = (field: string, words: string, where = "") => ({
    field,
    quote: words,
    where,
  });

  it("verifies a value whose quote is in the source and holds it", () => {
    const { outcome } = sanitizeOne(
      aiField("title"),
      "riapre il Teatro Verdi",
      source,
      [
        quote(
          "title",
          "Dopo due anni di lavori riapre il Teatro Verdi di Pisa",
          "p. 1",
        ),
      ],
    );

    expect(outcome).toEqual({
      status: "filled",
      value: "riapre il Teatro Verdi",
      verified: true,
      quotes: [
        {
          quote: "Dopo due anni di lavori riapre il Teatro Verdi di Pisa",
          where: "p. 1",
          found: true,
        },
      ],
    });
  });

  it("does not verify a value whose quote is in the source but does not hold it", () => {
    const { outcome } = sanitizeOne(
      aiField("title"),
      "Riapre il Teatro Rossini",
      source,
      [quote("title", "riapre il Teatro Verdi")],
    );

    expect(outcome).toMatchObject({
      verified: false,
      quotes: [{ found: true }],
    });
  });

  it("does not verify a value whose quote is not in the source", () => {
    const { outcome } = sanitizeOne(
      aiField("title"),
      "Teatro Rossini",
      source,
      [quote("title", "il Teatro Rossini")],
    );

    expect(outcome).toMatchObject({
      verified: false,
      quotes: [{ found: false }],
    });
  });

  it("verifies nothing without the source's text", () => {
    const { outcome } = sanitizeOne(
      aiField("title"),
      "Teatro Verdi",
      undefined,
      [quote("title", "Teatro Verdi")],
    );

    expect(outcome).toMatchObject({
      verified: false,
      quotes: [{ found: false }],
    });
  });

  it("verifies nothing without a quote", () => {
    expect(
      sanitizeOne(aiField("title"), "Teatro Verdi", source).outcome,
    ).toMatchObject({
      verified: false,
      quotes: [],
    });
  });

  it.each<[string, AiField, unknown, string, boolean]>([
    [
      "a number as the source writes it",
      aiField("seats", "integer"),
      "1200",
      "Biglietti: 1200 in vendita",
      true,
    ],
    [
      "a number its quote writes in a way that could mean two",
      aiField("seats", "integer"),
      "1200",
      "con 1.200 posti",
      false,
    ],
    [
      "a different number",
      aiField("seats", "integer"),
      "1300",
      "Biglietti: 1200 in vendita",
      false,
    ],
    [
      "a decimal comma",
      aiField("price", "number"),
      "12.5",
      "ridotto 12,5 euro",
      true,
    ],
    [
      "a decimal comma read as thousands",
      aiField("price", "number"),
      "125",
      "ridotto 12,5 euro",
      false,
    ],
    [
      "a number its one-word quote would find anywhere",
      aiField("seats", "integer"),
      "20",
      "20",
      false,
    ],
    [
      "a date by a one-word quote",
      aiField("day", "date"),
      "1999-01-01",
      "il",
      false,
    ],
    [
      "a yes by a one-letter quote",
      aiField("open", "boolean"),
      "true",
      "e",
      false,
    ],
    ["part of a word", aiField("title"), "ver", "il Teatro Verdi", false],
    [
      "a numeric choice whose number is in an unrelated quote",
      aiField("kind", "choice", { choices: [{ value: 2, label: "Danza" }] }),
      "2",
      "Comunicato stampa \u2013 14 ottobre 2026",
      false,
    ],
    [
      "a choice by its value, when the value is a word",
      aiField("kind", "choice", {
        choices: [{ value: "cultura", label: "Arts" }],
      }),
      "cultura",
      "Categoria: Cultura",
      true,
    ],
    [
      "a date whose quote writes its day and year",
      aiField("day", "date"),
      "2026-10-14",
      "14 ottobre 2026",
      true,
    ],
    [
      "a yes, by its quote alone",
      aiField("open", "boolean"),
      "true",
      "riapre il Teatro Verdi",
      true,
    ],
    [
      "a choice by its label",
      aiField("kind", "choice", { choices: [{ value: 3, label: "Cultura" }] }),
      "3",
      "Categoria: Cultura",
      true,
    ],
    [
      "a choice its quote does not name",
      aiField("kind", "choice", { choices: [{ value: 3, label: "Cultura" }] }),
      "3",
      "riapre il Teatro Verdi",
      false,
    ],
    [
      "a name to search for",
      aiField("place", "relation", { endpoint: "/api/places/" }),
      "Teatro Verdi",
      "riapre il Teatro Verdi di Pisa",
      true,
    ],
    [
      "text that a quote holds whole",
      aiField("summary", "text"),
      "riapre il Teatro Verdi di Pisa",
      "Dopo due anni di lavori riapre il Teatro Verdi di Pisa",
      true,
    ],
    [
      "text longer than its quote",
      aiField("summary", "text"),
      "Riapre il Teatro Verdi di Pisa. Ingresso gratuito per tutti.",
      "riapre il Teatro Verdi di Pisa",
      false,
    ],
    [
      "rich text by its words",
      aiField("body", "html"),
      "**Riapre** il Teatro Verdi di Pisa",
      "riapre il Teatro Verdi di Pisa",
      true,
    ],
  ])("checks %s", (_case, field, raw, words, verified) => {
    const { outcome } = sanitizeOne(field, raw, source, [
      quote(field.key, words),
    ]);

    expect(outcome).toMatchObject({ status: "filled", verified });
  });

  it("verifies a list only when a quote holds each of its values", () => {
    const cities = aiField("cities", "string", { multiple: true });
    const both = sanitizeOne(cities, ["Pisa", "Verdi"], source, [
      quote("cities", "Teatro Verdi di Pisa"),
    ]);
    const one = sanitizeOne(cities, ["Pisa", "Lucca"], source, [
      quote("cities", "Teatro Verdi di Pisa"),
    ]);

    expect(both.outcome).toMatchObject({ verified: true });
    expect(one.outcome).toMatchObject({ verified: false });
  });

  it("keeps the quotes of a discarded value, for the operator", () => {
    const field = aiField("seats", "integer", {
      constraints: { maximum: 1000 },
    });

    expect(
      sanitizeOne(field, "1200", source, [quote("seats", "1.200 posti")])
        .outcome,
    ).toEqual({
      status: "discarded",
      reason: "too-high",
      proposed: "1200",
      quotes: [{ quote: "1.200 posti", where: "", found: true }],
    });
  });

  it("warns about quotes it cannot use", () => {
    const { result } = sanitizeOne(aiField("title"), "Teatro Verdi", source, [
      quote("nope", "Teatro Verdi"),
      { field: "title" },
      "Teatro Verdi",
    ]);

    expect(result.warnings).toEqual([
      { kind: "unknown-field", path: "$.evidence[0]", field: "nope" },
      { kind: "unexpected-shape", path: "$.evidence[1]" },
      { kind: "unexpected-shape", path: "$.evidence[2]" },
    ]);
  });

  it("warns when the quotes the contract asks for are missing", () => {
    const contract = fill([aiField("title")]);
    const result = sanitizeFillAnswer(contract, { values: { title: "x" } });

    expect(result.warnings).toEqual([
      { kind: "unexpected-shape", path: "$.evidence" },
    ]);
  });

  it("ignores quotes the contract does not ask for", () => {
    const contract = fill([aiField("title")], { evidence: false });
    const result = sanitizeFillAnswer(
      contract,
      {
        values: { title: "Teatro Verdi" },
        evidence: [quote("title", "Teatro Verdi")],
      },
      { source },
    );

    expect(result.fields.title).toMatchObject({ verified: false, quotes: [] });
    expect(result.warnings).toEqual([
      { kind: "unknown-property", path: "$.evidence" },
    ]);
  });
});

// ─── The answer's shape ──────────────────────────────────────────────────────

// The answers of two local models (the test of the contract and the
// sanitizer with Ollama), reduced to the part that showed each case.
describe("sanitizeFillAnswer — verification rules", () => {
  const quote = (field: string, words: string, where = "") => ({
    field,
    quote: words,
    where,
  });
  const verifiedOf = (
    field: AiField,
    raw: unknown,
    source: string,
    words: string,
    rules?: Partial<AiVerificationRules>,
  ) => {
    const { outcome } = sanitizeOne(
      field,
      raw,
      source,
      [quote(field.key, words)],
      rules,
    );
    expect(outcome?.status).toBe("filled");
    return outcome?.status === "filled" ? outcome.verified : undefined;
  };

  const pressRelease = [
    "Comunicato stampa \u2013 Pisa, 14 ottobre 2026.",
    "Riapre il Teatro Verdi di Pisa.",
  ].join("\n");
  const draft = [
    "Articolo in bozza avanzata, da pubblicare il 14 ottobre 2026 alle 21:00.",
    "Priorit\u00e0: 150. Embargo fino al 12 marzo.",
  ].join("\n");
  const published = aiField("published_at", "datetime");
  const embargo = aiField("embargo_until", "date");

  it("applies the prudent rules when it is given none", () => {
    expect(DEFAULT_VERIFICATION_RULES).toEqual({
      dateYear: true,
      bareHours: false,
      timeZones: true,
      oneWordQuotes: "unique",
      richTextLinks: true,
    });
  });

  it("does not verify the midnight a model adds to a day without a time", () => {
    // One model added the offset too, the other did not.
    expect(
      verifiedOf(
        published,
        "2026-10-14T00:00:00+02:00",
        pressRelease,
        "Pisa, 14 ottobre 2026",
      ),
    ).toBe(false);
    expect(
      verifiedOf(
        published,
        "2026-10-14T00:00:00",
        pressRelease,
        "14 ottobre 2026",
      ),
    ).toBe(false);
  });

  it("verifies a date and time its quote writes whole", () => {
    expect(
      verifiedOf(
        published,
        "2026-10-14T21:00:00",
        draft,
        "14 ottobre 2026 alle 21:00",
      ),
    ).toBe(true);
  });

  it("does not verify an offset a model adds to the time of the source", () => {
    const rules = { timeZones: false };

    expect(
      verifiedOf(
        published,
        "2026-10-14T21:00:00+02:00",
        draft,
        "14 ottobre 2026 alle 21:00",
      ),
    ).toBe(false);
    expect(
      verifiedOf(
        published,
        "2026-10-14T21:00:00+02:00",
        draft,
        "14 ottobre 2026 alle 21:00",
        rules,
      ),
    ).toBe(true);
  });

  it("does not verify the year a model adds to a day without one", () => {
    expect(
      verifiedOf(embargo, "2026-03-12", draft, "Embargo fino al 12 marzo"),
    ).toBe(false);
    expect(
      verifiedOf(embargo, "2026-03-12", draft, "Embargo fino al 12 marzo", {
        dateYear: false,
      }),
    ).toBe(true);
  });

  it("verifies a time by its hours and minutes, an hour alone only when told so", () => {
    const doors = aiField("doors", "time");
    const source = "Apertura porte in serata, spettacolo alle 21.";

    expect(verifiedOf(doors, "20:00", source, "Apertura porte in serata")).toBe(
      false,
    );
    expect(verifiedOf(doors, "21:00", source, "spettacolo alle 21")).toBe(
      false,
    );
    expect(
      verifiedOf(doors, "21:00", source, "spettacolo alle 21", {
        bareHours: true,
      }),
    ).toBe(true);
  });

  describe("quotes of one word", () => {
    const sheet = [
      'Scheda prodotto: sedia da giardino "Riva".',
      "Attributo 7: alluminio anodizzato. Attributo 12: impilabile. Attributo 150: garanzia 5 anni.",
      "Colore: rosso. Finitura: rosso. Peso: 4,25 kg.",
    ].join("\n");

    it("verifies a value that is the one word the source writes once", () => {
      const { outcome } = sanitizeOne(
        aiField("attr_012"),
        "impilabile",
        sheet,
        [quote("attr_012", "impilabile", "Attributo 12")],
      );

      expect(outcome).toEqual({
        status: "filled",
        value: "impilabile",
        verified: true,
        quotes: [{ quote: "impilabile", where: "Attributo 12", found: true }],
      });
    });

    it("does not count a word the source writes twice, nor any when told so", () => {
      expect(verifiedOf(aiField("colour"), "rosso", sheet, "rosso")).toBe(
        false,
      );
      expect(
        verifiedOf(aiField("attr_012"), "impilabile", sheet, "impilabile", {
          oneWordQuotes: "never",
        }),
      ).toBe(false);
    });

    it("verifies with one word only a value it is whole", () => {
      const choice = aiField("finish", "choice", {
        choices: [{ value: "r", label: "Impilabile" }],
      });

      expect(verifiedOf(choice, "r", sheet, "impilabile")).toBe(true);
      expect(
        verifiedOf(aiField("name"), "sedia impilabile", sheet, "impilabile"),
      ).toBe(false);
      expect(
        verifiedOf(
          aiField("stackable", "boolean"),
          "true",
          sheet,
          "impilabile",
        ),
      ).toBe(false);
      expect(
        verifiedOf(aiField("day", "date"), "2026-10-07", sheet, "7", {
          dateYear: false,
        }),
      ).toBe(false);
    });
  });

  describe("rich text", () => {
    const body = aiField("body", "html");

    it("verifies rich text whose quote carries the Markdown of the source", () => {
      const markdown = [
        "**Grande festa** per la riapertura. Il programma:",
        "- concerto inaugurale;",
        "- visite guidate gratuite;",
        "- mostra fotografica.",
        "Info su [il sito del teatro](https://teatroverdipisa.it).",
      ].join("\n");
      const source = `Rubrica: Teatro.\n\nTesto:\n${markdown}`;

      expect(verifiedOf(body, markdown, source, markdown)).toBe(true);
    });

    it("does not verify rich text with a link its quote does not write", () => {
      const source = "Info sul sito del teatro, teatroverdipisa.it.";
      const quoted = "Info sul sito del teatro, teatroverdipisa.it";

      expect(
        verifiedOf(
          body,
          "Info sul [sito del teatro](https://teatroverdipisa.it/biglietti)",
          source,
          quoted,
        ),
      ).toBe(false);
      expect(
        verifiedOf(
          body,
          "Info sul [sito del teatro](https://teatroverdipisa.it)",
          source,
          quoted,
        ),
      ).toBe(true);
      expect(
        verifiedOf(
          body,
          "Info sul [sito del teatro](https://teatroverdipisa.it/biglietti)",
          source,
          quoted,
          { richTextLinks: false },
        ),
      ).toBe(true);
    });
  });

  it("does not verify an address whose quote writes a longer one", () => {
    const tickets = aiField("tickets", "url");
    const source =
      "Biglietti su https://teatro.it/biglietti/2027 e al botteghino.";
    const words = "Biglietti su https://teatro.it/biglietti/2027";

    expect(
      verifiedOf(tickets, "https://teatro.it/biglietti", source, words),
    ).toBe(false);
    expect(
      verifiedOf(tickets, "https://teatro.it/biglietti/2027", source, words),
    ).toBe(true);
  });

  it("reads the rules from stored settings of any shape, and never throws on them", () => {
    const { result } = sanitizeOne(
      embargo,
      "2026-03-12",
      draft,
      [],
      null as never,
    );

    expect(result.fields.embargo_until).toMatchObject({ status: "filled" });
    expect(verificationRulesOf(null)).toEqual(DEFAULT_VERIFICATION_RULES);
    expect(verificationRulesOf("dateYear")).toEqual(DEFAULT_VERIFICATION_RULES);
    // Only the settings' own values: an inherited one is no setting.
    expect(verificationRulesOf(Object.create({ dateYear: false }))).toEqual(
      DEFAULT_VERIFICATION_RULES,
    );
    expect(verificationRulesOf({ bareHours: true }).bareHours).toBe(true);
  });

  it("keeps its defaults out of reach", () => {
    expect(Object.isFrozen(DEFAULT_VERIFICATION_RULES)).toBe(true);
  });

  it("keeps the default of a rule given with the wrong type", () => {
    const malformed = {
      dateYear: undefined,
      timeZones: "no",
      oneWordQuotes: "sometimes",
      richTextLinks: 0,
    } as unknown as Partial<AiVerificationRules>;

    expect(
      verifiedOf(
        embargo,
        "2026-03-12",
        draft,
        "Embargo fino al 12 marzo",
        malformed,
      ),
    ).toBe(false);
    expect(
      verifiedOf(
        published,
        "2026-10-14T21:00:00+02:00",
        draft,
        "14 ottobre 2026 alle 21:00",
        malformed,
      ),
    ).toBe(false);
  });
});

describe("sanitizeFillAnswer — the answer's shape", () => {
  const contract = fill([aiField("title"), aiField("seats", "integer")]);

  it.each<[string, unknown, string]>([
    ["not an object", "Teatro Verdi", "$"],
    ["an array", [], "$"],
    ["without values", { evidence: [] }, "$.values"],
    ["with values that are not an object", { values: ["x"] }, "$.values"],
  ])("reads an answer %s as empty", (_case, raw, path) => {
    const result = sanitizeFillAnswer(contract, raw);

    expect(result.readable).toBe(false);
    expect(result.fields).toEqual({
      title: { status: "empty" },
      seats: { status: "empty" },
    });
    expect(result.warnings).toContainEqual({ kind: "unexpected-shape", path });
  });

  it("warns about missing and unknown properties, and reads the rest", () => {
    const result = sanitizeFillAnswer(contract, {
      values: { title: "Teatro Verdi", extra: "x" },
      evidence: [],
      note: "hi",
    });

    expect(result.readable).toBe(true);
    expect(valueOf(result.fields.title)).toBe("Teatro Verdi");
    expect(result.fields.seats).toEqual({ status: "empty" });
    expect(result.warnings).toEqual([
      { kind: "unknown-property", path: "$.note" },
      { kind: "unknown-property", path: "$.values.extra" },
      { kind: "unexpected-shape", path: "$.values.seats" },
    ]);
  });

  it("keys the fields by the form's key, not the property name", () => {
    const dotted = fill([aiField("seo.title")]);
    const result = sanitizeFillAnswer(dotted, {
      values: { seo_title: "Teatro" },
      evidence: [],
    });

    expect(Object.keys(result.fields)).toEqual(["seo.title"]);
    expect(valueOf(result.fields["seo.title"])).toBe("Teatro");
  });

  it("is plain JSON", () => {
    const result = sanitizeFillAnswer(contract, {
      values: { title: "x", seats: "3" },
      evidence: [],
    });

    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });
});

// ─── Extract ─────────────────────────────────────────────────────────────────

describe("sanitizeExtractAnswer", () => {
  const article = (relationChoices?: AiContractSource["relationChoices"]) => ({
    type: "article",
    endpoint: "/api/articles/",
    entity: modelOf([
      aiField("title"),
      aiField("category", "relation", { endpoint: "/api/categories/" }),
    ]),
    ...(relationChoices ? { relationChoices } : {}),
  });
  const category = {
    type: "category",
    endpoint: "/api/categories/",
    entity: modelOf([
      aiField("name"),
      aiField("parent", "relation", { endpoint: "/api/categories/" }),
    ]),
  };
  const listed = { category: [{ value: 1, label: "Cultura" }] };
  const item = (
    type: string,
    ref: string,
    values: Record<string, unknown>,
    evidence: unknown[] = [],
  ) => ({ type, ref, values, evidence });
  const none = { record: "", item: "" };

  it("reads each item with its type, ref and fields", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "article-1", {
          title: "Riapre il Verdi",
          category: { record: "", item: "category-1" },
        }),
        item("category", "category-1", { name: "Teatro", parent: none }),
      ],
    });

    expect(result.readable).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.items).toEqual([
      {
        type: "article",
        ref: "article-1",
        fields: {
          title: {
            status: "filled",
            value: "Riapre il Verdi",
            verified: false,
            quotes: [],
          },
          category: {
            status: "filled",
            value: { item: "category-1" },
            verified: false,
            quotes: [],
          },
        },
      },
      {
        type: "category",
        ref: "category-1",
        fields: {
          name: {
            status: "filled",
            value: "Teatro",
            verified: false,
            quotes: [],
          },
          parent: { status: "empty" },
        },
      },
    ]);
  });

  it("lets a listed record win over an item of the answer", () => {
    const contract = compileExtractContract([article(listed), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "1", item: "c" },
        }),
        item("category", "c", { name: "Cultura", parent: none }),
      ],
    });

    expect(valueOf(result.items[0]?.fields.category)).toEqual({ id: 1 });
  });

  it("keeps the item beside a name to search for, for when the search finds nothing", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "Teatro", item: "c" },
        }),
        item("category", "c", { name: "Teatro", parent: none }),
      ],
    });

    expect(valueOf(result.items[0]?.fields.category)).toEqual({
      search: "Teatro",
      item: "c",
    });
  });

  it("drops a link to an item that is missing, of another type or the item itself", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "", item: "nowhere" },
        }),
        item("article", "b", {
          title: "y",
          category: { record: "Teatro", item: "a" },
        }),
        item("category", "c", {
          name: "Teatro",
          parent: { record: "", item: "c" },
        }),
      ],
    });

    expect(
      result.items.map((one) => one.fields.category ?? one.fields.parent),
    ).toEqual([
      { status: "empty" },
      {
        status: "filled",
        value: { search: "Teatro" },
        verified: false,
        quotes: [],
      },
      { status: "empty" },
    ]);
    expect(result.warnings).toEqual([
      {
        kind: "unknown-item",
        path: "$.items[0].values.category.item",
        item: "nowhere",
      },
      {
        kind: "unknown-item",
        path: "$.items[1].values.category.item",
        item: "a",
      },
      {
        kind: "unknown-item",
        path: "$.items[2].values.parent.item",
        item: "c",
      },
    ]);
  });

  it("links to an item listed later", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "", item: "c" },
        }),
        item("category", "c", { name: "Teatro", parent: none }),
      ],
    });

    expect(valueOf(result.items[0]?.fields.category)).toEqual({ item: "c" });
  });

  it("links to no item when two share a ref, nor counts a self-link of either", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "", item: "c" },
        }),
        item("category", "c", { name: "Teatro", parent: none }),
        item("category", "c", {
          name: "Musica",
          parent: { record: "", item: "c" },
        }),
        item("category", "", { name: "Danza", parent: none }),
      ],
    });

    expect(result.items.map((one) => one.ref)).toEqual(["a", "", "", ""]);
    expect(result.items[0]?.fields.category).toEqual({ status: "empty" });
    expect(result.items[2]?.fields.parent).toEqual({ status: "empty" });
    expect(result.warnings).toEqual([
      { kind: "repeated-ref", path: "$.items[1].ref", ref: "c" },
      { kind: "repeated-ref", path: "$.items[2].ref", ref: "c" },
      { kind: "repeated-ref", path: "$.items[3].ref", ref: "" },
      {
        kind: "unknown-item",
        path: "$.items[0].values.category.item",
        item: "c",
      },
      {
        kind: "unknown-item",
        path: "$.items[2].values.parent.item",
        item: "c",
      },
    ]);
  });

  it("discards a link whose record is not listed, item or not", () => {
    const contract = compileExtractContract([article(listed), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "99", item: "c" },
        }),
        item("category", "c", { name: "Teatro", parent: none }),
      ],
    });

    expect(reasonOf(result.items[0]?.fields.category)).toBe("not-listed");
  });

  it("skips an item without values: it is no record", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("article", "a", {
          title: "x",
          category: { record: "", item: "c" },
        }),
        { type: "category", ref: "c" },
      ],
    });

    expect(result.items.map((one) => one.type)).toEqual(["article"]);
    expect(result.items[0]?.fields.category).toEqual({ status: "empty" });
    expect(result.warnings).toEqual([
      { kind: "unexpected-shape", path: "$.items[1].values" },
      {
        kind: "unknown-item",
        path: "$.items[0].values.category.item",
        item: "c",
      },
    ]);
  });

  it("discards a link that is not an object", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [item("article", "a", { title: "x", category: "Teatro" })],
    });

    expect(reasonOf(result.items[0]?.fields.category)).toBe("format");
  });

  it("skips items of an unknown type or without the shape of an item", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(contract, {
      items: [
        item("event", "e", {}),
        "x",
        item("category", "c", { name: "Teatro", parent: none }),
      ],
    });

    expect(result.items.map((one) => one.type)).toEqual(["category"]);
    expect(result.warnings).toEqual([
      { kind: "unknown-type", path: "$.items[0].type", type: "event" },
      { kind: "unexpected-shape", path: "$.items[1]" },
    ]);
  });

  it("verifies the quotes of each item against the source", () => {
    const contract = compileExtractContract([article(), category]);
    const result = sanitizeExtractAnswer(
      contract,
      {
        items: [
          item("category", "c", { name: "Teatro", parent: none }, [
            { field: "name", quote: "la categoria Teatro", where: "" },
          ]),
        ],
      },
      { source: "Nasce la categoria Teatro." },
    );

    expect(result.items[0]?.fields.name).toMatchObject({ verified: true });
  });

  it.each<[string, unknown, string]>([
    ["not an object", null, "$"],
    ["without items", { items: "x" }, "$.items"],
  ])("reads an answer %s as no item", (_case, raw, path) => {
    const contract = compileExtractContract([category]);

    expect(sanitizeExtractAnswer(contract, raw)).toEqual({
      readable: false,
      items: [],
      warnings: [{ kind: "unexpected-shape", path }],
    });
  });
});

import { describe, expect, it } from "vitest";
import { readMapoAiFillSession } from "../runtime/shared/fillSession";

/** A field of a kept session, as `snapshot()` writes it. */
function field(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "title",
    path: "title",
    action: "apply",
    replaces: false,
    shown: true,
    outcome: {
      status: "filled",
      value: "About us",
      verified: true,
      quotes: [{ quote: "About us", where: "", found: true }],
    },
    applied: true,
    undoable: true,
    round: 1,
    writes: [
      {
        order: 1,
        records: [
          {
            path: "title",
            write: { existed: false, made: [] },
            written: '"About us"',
          },
        ],
      },
    ],
    ...extra,
  };
}

function session(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 2,
    rounds: 1,
    answers: [
      { round: 1, provider: { id: "mock", model: "mock" }, prompt: 1, at: 1 },
    ],
    fields: [field()],
    ...extra,
  };
}

describe("readMapoAiFillSession", () => {
  it("reads a session as snapshot() keeps it", () => {
    expect(readMapoAiFillSession(session())).toEqual(session());
  });

  it("reads a session of the first format, which kept no related records", () => {
    expect(readMapoAiFillSession(session({ format: 1 }))).toEqual(session());
  });

  it.each([
    ["no object", "a session"],
    ["another format", session({ format: 3 })],
    ["no count of answers", session({ rounds: -1 })],
    ["a count that is no whole number", session({ rounds: 1.5 })],
  ])("reads nothing from %s", (_name, value) => {
    expect(readMapoAiFillSession(value)).toBeUndefined();
  });

  it("leaves out an answer or a field it cannot read, and a second field at a path", () => {
    const read = readMapoAiFillSession(
      session({
        answers: [
          {
            round: 2,
            provider: { id: "mock", model: "mock" },
            prompt: 1,
            at: 1,
          },
          { round: 1, provider: { id: "mock" }, prompt: 1, at: 1 },
        ],
        fields: [
          field(),
          field({ key: "excerpt", path: "excerpt", round: 2 }),
          field({ key: "slug", path: "slug", action: "write" }),
          field({ key: "seo", path: "__proto__.polluted" }),
          field({ key: "intro", path: "intro", outcome: { status: "?" } }),
          field({ key: "lead", path: "lead", review: "liked" }),
          field({ value: "a second title" }),
        ],
      }),
    );

    expect(read?.answers).toEqual([]);
    expect(read?.fields.map((one) => one.path)).toEqual(["title"]);
  });

  it("keeps a field whose writes it cannot read, with nothing to undo it", () => {
    const broken = [
      { order: 1, records: [] },
      { order: 1, records: [{ path: "title", write: { existed: "no" } }] },
      {
        order: 1,
        records: [
          {
            path: "seo.title",
            write: { existed: false, made: [{ path: "slug", wasNull: false }] },
          },
        ],
      },
    ];
    for (const writes of broken) {
      const read = readMapoAiFillSession(
        session({ fields: [field({ writes: [writes] })] }),
      );
      expect(read?.fields[0]).toMatchObject({ path: "title", writes: [] });
    }
  });

  it("takes no write whose earlier value is not data JSON carries, as a page could pass", () => {
    const record = {
      path: "title",
      before: new Date(0),
      write: { existed: true, made: [] },
      written: '"About us"',
    };
    const read = readMapoAiFillSession(
      session({
        fields: [field({ writes: [{ order: 1, records: [record] }] })],
      }),
    );
    expect(read?.fields[0]).toMatchObject({ path: "title", writes: [] });
  });

  it("keeps the objects a write made on the way to its path, and what the path held", () => {
    const record = {
      path: "seo.title",
      before: { lang: "it" },
      write: { existed: false, made: [{ path: "seo", wasNull: true }] },
      written: '"About us"',
    };
    const read = readMapoAiFillSession(
      session({
        fields: [field({ writes: [{ order: 3, records: [record] }] })],
      }),
    );
    expect(read?.fields[0]?.writes).toEqual([{ order: 3, records: [record] }]);
  });
});

describe("readMapoAiFillSession — related records", () => {
  /** A category that waits, several records matching the AI's name. */
  const related = (relations: unknown, extra: Record<string, unknown> = {}) =>
    field({
      key: "category",
      path: "category",
      action: "manual",
      applied: false,
      undoable: false,
      writes: [],
      outcome: {
        status: "filled",
        value: { search: "Open" },
        verified: true,
        quotes: [{ quote: "Category: Open", where: "", found: true }],
      },
      relations,
      ...extra,
    });

  const match = (extra: Record<string, unknown> = {}) => ({
    at: "",
    name: "Open",
    status: "ambiguous",
    count: 2,
    candidates: [
      { id: 1, value: 1, label: "Open data" },
      { id: 2, value: 2, label: "Open source" },
    ],
    ...extra,
  });

  it("reads the records found for a field, the pick and the place included", () => {
    const kept = session({
      fields: [related([match({ choice: 1, ignored: false })])],
    });

    expect(readMapoAiFillSession(kept)?.fields[0]?.relations).toEqual([
      match({ choice: 1 }),
    ]);
  });

  it.each([
    ["a place outside the field", { path: "other.0.article" }],
    ["an unsafe place in the value", { at: "__proto__" }],
    [
      "more than five candidates",
      {
        candidates: Array.from({ length: 6 }, (_, i) => ({
          id: i,
          value: i,
          label: `${i}`,
        })),
      },
    ],
    ["a pick out of the candidates", { choice: 2 }],
    [
      "a candidate without a value",
      { candidates: [{ id: 1, label: "Open data" }] },
    ],
    ["a value no draft carries", { status: "found", value: new Date(0) }],
    ["an unknown status", { status: "maybe" }],
  ])(
    "drops the records of a field for %s, and leaves its value to set by hand",
    (_name, extra) => {
      const waiting = related([match(extra)], { action: "confirm" });

      const [read] =
        readMapoAiFillSession(session({ fields: [waiting] }))?.fields ?? [];

      expect(read?.relations).toBeUndefined();
      // Apply would write the AI's names themselves: the value is the
      // operator's to set.
      expect(read?.action).toBe("manual");
    },
  );

  it("reads a field of the first format that names a record as one to set by hand", () => {
    const first = session({
      format: 1,
      fields: [related(undefined, { action: "confirm" })],
    });

    expect(readMapoAiFillSession(first)?.fields[0]).toMatchObject({
      action: "manual",
    });
  });
});

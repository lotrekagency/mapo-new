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
    format: 1,
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

  it.each([
    ["no object", "a session"],
    ["another format", session({ format: 2 })],
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

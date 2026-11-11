import { describe, expect, it, vi } from "vitest";
import {
  MAPO_AI_RELATION_LIST_MAX,
  MAPO_AI_RELATION_SEARCH_MAX,
  effectiveMatch,
  hasFoundRelation,
  holdsRelationId,
  isRelationResolved,
  isSameName,
  listMapoAiRelations,
  mapoAiRelationFields,
  relationValueOf,
  resolveMapoAiRelations,
  searchPath,
} from "../runtime/shared/relations";
import type {
  MapoAiRelationField,
  MapoAiRelationLists,
  MapoAiRelationMatch,
} from "../runtime/shared/relations";
import type { AiFieldOutcome, AiValue } from "../runtime/shared/sanitize";

type Get = (
  path: string,
  options: { signal?: AbortSignal },
) => Promise<unknown>;

const CATEGORY: MapoAiRelationField = {
  path: "category",
  endpoint: "/api/categories",
  itemText: "name",
  itemValue: "id",
  returnObject: false,
  multiple: false,
};

const CATEGORIES = [
  { id: 1, name: "Technology" },
  { id: 2, name: "Culture" },
  { id: 3, name: "City" },
];

function filled(value: AiValue): AiFieldOutcome {
  return { status: "filled", value, verified: true, quotes: [] };
}

/** A backend that answers each path from `answers`, and rejects any other. */
function backend(answers: Record<string, unknown>) {
  return vi.fn<Get>(async (path) => {
    if (!Object.hasOwn(answers, path)) throw new Error(`404 ${path}`);
    return answers[path];
  });
}

const NO_LISTS: MapoAiRelationLists = { choices: {}, records: {} };

describe("mapoAiRelationFields", () => {
  it("finds each fks and m2m field with an endpoint, with the field's defaults", () => {
    expect(
      mapoAiRelationFields([
        { key: "title", type: "text" },
        {
          key: "category",
          type: "fks",
          attrs: { endpoint: "/api/categories" },
        },
        {
          key: "tags",
          type: "m2m",
          attrs: {
            endpoint: "api/tags",
            itemText: "label",
            itemValue: "slug",
            returnObject: false,
          },
        },
        {
          key: "author",
          type: "fks",
          attrs: { endpoint: "/api/a", multiple: true },
        },
        { key: "orphan", type: "fks", attrs: {} },
      ]),
    ).toEqual([
      {
        path: "category",
        endpoint: "/api/categories",
        itemText: "name",
        itemValue: "id",
        returnObject: true,
        multiple: false,
      },
      {
        path: "tags",
        endpoint: "api/tags",
        itemText: "label",
        itemValue: "slug",
        returnObject: false,
        multiple: true,
      },
      {
        path: "author",
        endpoint: "/api/a",
        itemText: "name",
        itemValue: "id",
        returnObject: true,
        multiple: true,
      },
    ]);
  });

  it("finds those inside the items of a list, by template", () => {
    const fields = mapoAiRelationFields([
      {
        key: "speakers",
        type: "repeater",
        fields: [
          {
            key: "organisation",
            type: "fks",
            attrs: { endpoint: "/api/orgs" },
          },
        ],
      },
      {
        key: "blocks",
        type: "repeater",
        attrs: {
          templates: {
            related: [
              {
                key: "article",
                type: "fks",
                attrs: { endpoint: "/api/articles" },
              },
            ],
            cta: {
              label: "Call to action",
              fields: [
                { key: "page", type: "fks", attrs: { endpoint: "/api/pages" } },
              ],
            },
          },
        },
      },
    ]);

    expect(fields.map((one) => [one.path, one.template])).toEqual([
      ["speakers.*.organisation", undefined],
      ["blocks.*.article", "related"],
      ["blocks.*.page", "cta"],
    ]);
  });
});

describe("listMapoAiRelations", () => {
  it("lists the records of a relation that has few, once per endpoint", async () => {
    const get = backend({ "/api/categories": CATEGORIES });
    const other = { ...CATEGORY, path: "blocks.*.category" };

    const lists = await listMapoAiRelations([CATEGORY, other], { get });

    expect(get).toHaveBeenCalledTimes(1);
    expect(lists.choices.category).toEqual([
      { value: 1, label: "Technology" },
      { value: 2, label: "Culture" },
      { value: 3, label: "City" },
    ]);
    expect(lists.records["blocks.*.category"]).toEqual(CATEGORIES);
  });

  it("reads a page of Django REST Framework only when it holds every record", async () => {
    const whole = { count: 3, next: null, previous: null, results: CATEGORIES };
    const paged = {
      count: 30,
      next: "/api/categories?page=2",
      results: CATEGORIES,
    };
    const counted = { count: 30, results: CATEGORIES };

    for (const [answer, isListed] of [
      [whole, true],
      [paged, false],
      [counted, false],
    ] as const) {
      const lists = await listMapoAiRelations([CATEGORY], {
        get: backend({ "/api/categories": answer }),
      });
      expect(Object.hasOwn(lists.choices, "category")).toBe(isListed);
    }
  });

  it(`leaves a relation to the search when it has more than ${MAPO_AI_RELATION_LIST_MAX} records, or one that cannot be a choice`, async () => {
    const many = Array.from(
      { length: MAPO_AI_RELATION_LIST_MAX + 1 },
      (_, i) => ({
        id: i + 1,
        name: `Category ${i + 1}`,
      }),
    );
    const nameless = [...CATEGORIES, { id: 4 }];

    for (const answer of [many, nameless, [], "not a list"]) {
      const lists = await listMapoAiRelations([CATEGORY], {
        get: backend({ "/api/categories": answer }),
      });
      expect(lists.choices).toEqual({});
    }
  });

  it("leaves out a relation whose endpoint fails, a path skipped, and a path two templates read differently", async () => {
    const failing = await listMapoAiRelations([CATEGORY], { get: backend({}) });
    expect(failing).toEqual(NO_LISTS);

    const skipped = await listMapoAiRelations(
      [CATEGORY],
      { get: backend({ "/api/categories": CATEGORIES }) },
      { skip: new Set(["category"]) },
    );
    expect(skipped).toEqual(NO_LISTS);

    const one = { ...CATEGORY, path: "blocks.*.x", template: "a" };
    const two = { ...one, template: "b", endpoint: "/api/tags" };
    const torn = await listMapoAiRelations([one, two], {
      get: backend({ "/api/categories": CATEGORIES, "/api/tags": CATEGORIES }),
    });
    expect(torn).toEqual(NO_LISTS);
  });

  it("asks an endpoint written without its leading slash from the app's root", async () => {
    const get = backend({ "/api/categories": CATEGORIES });
    await listMapoAiRelations([{ ...CATEGORY, endpoint: "api/categories" }], {
      get,
    });
    expect(get).toHaveBeenCalledWith("/api/categories", { signal: undefined });
  });
});

describe("resolveMapoAiRelations", () => {
  const lists: MapoAiRelationLists = {
    choices: { category: [] },
    records: { category: CATEGORIES },
  };

  it("finds a record the AI picked from the list by its id", async () => {
    const get = backend({});
    const found = await resolveMapoAiRelations(
      { category: filled({ id: 2 }) },
      [CATEGORY],
      lists,
      { get },
    );

    expect(found).toEqual({
      category: [
        {
          at: "",
          name: "Culture",
          status: "found",
          id: 2,
          value: 2,
          label: "Culture",
        },
      ],
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("writes the record itself for a field that saves records, and finds the page's own choices", async () => {
    const asRecord = { ...CATEGORY, returnObject: true };
    const found = await resolveMapoAiRelations(
      { category: filled({ id: "7" }) },
      [asRecord],
      NO_LISTS,
      { get: backend({}) },
      { choices: { category: [{ value: 7, label: "Sport" }] } },
    );

    expect(found.category?.[0]).toMatchObject({
      status: "found",
      id: 7,
      value: { id: 7, name: "Sport" },
      label: "Sport",
    });
  });

  it("finds a name the search gives alone, or alone with that very name", async () => {
    const get = backend({
      "/api/categories?search=Culture": [
        { id: 2, name: "Culture" },
        { id: 9, name: "Agriculture" },
      ],
      "/api/categories?search=caf%C3%A9": [{ id: 4, name: "Café " }],
    });

    const found = await resolveMapoAiRelations(
      {
        category: filled({ search: "Culture" }),
        other: filled({ search: "café" }),
      },
      [CATEGORY, { ...CATEGORY, path: "other" }],
      NO_LISTS,
      { get },
    );

    expect(found.category).toEqual([
      {
        at: "",
        name: "Culture",
        status: "found",
        id: 2,
        value: 2,
        label: "Culture",
      },
    ]);
    expect(found.other?.[0]).toMatchObject({ status: "found", id: 4 });
    expect(found.other?.[0]?.renamed).toBeUndefined();
  });

  it("finds the only record of a search under another name, as renamed", async () => {
    const get = backend({
      "/api/categories?search=Culture": [{ id: 5, name: "Culture & Arts" }],
    });

    const found = await resolveMapoAiRelations(
      { category: filled({ search: "Culture" }) },
      [CATEGORY],
      NO_LISTS,
      { get },
    );

    expect(found.category?.[0]).toEqual({
      at: "",
      name: "Culture",
      status: "found",
      id: 5,
      value: 5,
      label: "Culture & Arts",
      renamed: true,
    });
  });

  it("gives up to five candidates when several records match, and only the count when more do", async () => {
    const few = [
      { id: 1, name: "Open data" },
      { id: 2, name: "Open source" },
    ];
    const many = { count: 12, next: "/p2", results: few };
    const get = backend({
      "/api/categories?search=Open": few,
      "/api/categories?search=Data": many,
    });

    const found = await resolveMapoAiRelations(
      {
        category: filled({ search: "Open" }),
        other: filled({ search: "Data" }),
      },
      [CATEGORY, { ...CATEGORY, path: "other" }],
      NO_LISTS,
      { get },
    );

    expect(found.category?.[0]).toEqual({
      at: "",
      name: "Open",
      status: "ambiguous",
      count: 2,
      candidates: [
        { id: 1, value: 1, label: "Open data" },
        { id: 2, value: 2, label: "Open source" },
      ],
    });
    expect(found.other?.[0]).toEqual({
      at: "",
      name: "Data",
      status: "ambiguous",
      count: 12,
    });
  });

  it("finds none for an empty search, and says when the search failed", async () => {
    const get = backend({ "/api/categories?search=Nope": { results: [] } });

    const found = await resolveMapoAiRelations(
      {
        category: filled({ search: "Nope" }),
        other: filled({ search: "Err" }),
      },
      [CATEGORY, { ...CATEGORY, path: "other" }],
      NO_LISTS,
      { get },
    );

    expect(found.category).toEqual([{ at: "", name: "Nope", status: "none" }]);
    expect(found.other).toEqual([
      { at: "", name: "Err", status: "none", failed: true },
    ]);
  });

  it("searches a name once, and finds each record of a list of records", async () => {
    const tags = { ...CATEGORY, path: "tags", multiple: true };
    const get = backend({
      "/api/categories?search=Culture": [{ id: 2, name: "Culture" }],
    });

    const found = await resolveMapoAiRelations(
      {
        tags: filled([{ search: "Culture" }, { id: 3 }, { search: "Culture" }]),
      },
      [tags],
      { choices: {}, records: { tags: CATEGORIES } },
      { get },
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(found.tags?.map((one) => [one.at, one.status, one.id])).toEqual([
      ["0", "found", 2],
      ["1", "found", 3],
      ["2", "found", 2],
    ]);
  });

  it("finds the records inside the items of a list, by the item's template", async () => {
    const article: MapoAiRelationField = {
      ...CATEGORY,
      path: "blocks.*.article",
      template: "related",
      endpoint: "/api/articles",
      itemText: "title",
    };
    const get = backend({
      "/api/articles?search=Open%20data": [{ id: 7, title: "Open data" }],
    });

    const found = await resolveMapoAiRelations(
      {
        blocks: filled([
          { _template: "text", body: "Hello" },
          { _template: "related", article: { search: "Open data" } },
        ]),
      },
      [article],
      NO_LISTS,
      { get },
    );

    expect(found.blocks).toEqual([
      {
        at: "1.article",
        name: "Open data",
        status: "found",
        id: 7,
        value: 7,
        label: "Open data",
      },
    ]);
  });

  it("leaves out a value that names a record of a field the form does not describe as a relation", async () => {
    const found = await resolveMapoAiRelations(
      { title: filled({ search: "News" }), category: filled({ id: 1 }) },
      [CATEGORY],
      lists,
      { get: backend({}) },
    );

    expect(Object.keys(found)).toEqual(["category"]);
  });
});

describe("the value a field takes", () => {
  const found = (at: string, id: number): MapoAiRelationMatch => ({
    at,
    name: `n${id}`,
    status: "found",
    id,
    value: id,
    label: `n${id}`,
  });

  it("puts each record found in its place: a list keeps those found, an item holds null for one not found", () => {
    const none: MapoAiRelationMatch = { at: "1", name: "x", status: "none" };
    expect(relationValueOf({ search: "a" }, [found("", 4)])).toBe(4);
    expect(
      relationValueOf({ search: "a" }, [{ ...none, at: "" }]),
    ).toBeUndefined();
    expect(
      relationValueOf(
        [{ search: "a" }, { search: "x" }],
        [found("0", 4), none],
      ),
    ).toEqual([4]);
    expect(
      relationValueOf(
        [{ title: "T", article: { search: "x" }, tags: [{ id: 1 }] }],
        [{ ...none, at: "0.article" }, found("0.tags.0", 1)],
      ),
    ).toEqual([{ title: "T", article: null, tags: [1] }]);
  });

  it("takes a record found under another name only when asked, and the candidate the operator picked", () => {
    const renamed = { ...found("", 4), renamed: true };
    expect(relationValueOf({ search: "a" }, [renamed])).toBe(4);
    expect(relationValueOf({ search: "a" }, [renamed], false)).toBeUndefined();

    const picked: MapoAiRelationMatch = {
      at: "",
      name: "Open",
      status: "ambiguous",
      candidates: [
        { id: 1, value: 1, label: "Open data" },
        { id: 2, value: 2, label: "Open source" },
      ],
      choice: 1,
    };
    expect(effectiveMatch(picked)).toMatchObject({ status: "found", id: 2 });
    expect(relationValueOf({ search: "Open" }, [picked])).toBe(2);
  });

  it("tells a value resolved from one that waits", () => {
    const renamed = { ...found("", 4), renamed: true };
    const ambiguous: MapoAiRelationMatch = {
      at: "",
      name: "x",
      status: "ambiguous",
    };
    expect(isRelationResolved([found("", 1)])).toBe(true);
    expect(isRelationResolved([renamed])).toBe(false);
    expect(isRelationResolved([ambiguous])).toBe(false);
    expect(isRelationResolved([])).toBe(false);
    expect(hasFoundRelation([ambiguous, renamed])).toBe(true);
    expect(hasFoundRelation([ambiguous])).toBe(false);
  });

  it("tells a record a field holds by its id, as the field saves it", () => {
    expect(holdsRelationId(2, "2", "id")).toBe(true);
    expect(holdsRelationId([{ id: 1 }, { id: 2 }], 2, "id")).toBe(true);
    expect(holdsRelationId([{ slug: "a" }], "a", "slug")).toBe(true);
    expect(holdsRelationId(null, 2, "id")).toBe(false);
  });
});

describe("names and searches", () => {
  it("compares names but for case, accents and spaces", () => {
    expect(isSameName("Città  Vecchia", "citta vecchia")).toBe(true);
    expect(isSameName("Culture", "Agriculture")).toBe(false);
    expect(isSameName("", "")).toBe(false);
  });

  it("searches as the form's relation field does", () => {
    expect(searchPath("/api/tags", "Open data")).toBe(
      "/api/tags?search=Open%20data",
    );
    expect(searchPath("api/tags?kind=1", "a&b")).toBe(
      "/api/tags?kind=1&search=a%26b",
    );
  });
});

describe("the requests to the backend", () => {
  it("never rejects on a get that throws at once, listing or searching", async () => {
    const get = vi.fn<Get>(() => {
      throw new Error("No $fetch");
    });

    const lists = await listMapoAiRelations([CATEGORY], { get });
    const found = await resolveMapoAiRelations(
      { category: filled({ search: "Culture" }) },
      [CATEGORY],
      NO_LISTS,
      { get },
    );

    expect(lists).toEqual(NO_LISTS);
    expect(found.category).toEqual([
      { at: "", name: "Culture", status: "none", failed: true },
    ]);
  });

  it(`searches ${MAPO_AI_RELATION_SEARCH_MAX} names of an answer at most, and says the others were not searched`, async () => {
    const article = { ...CATEGORY, path: "blocks.*.article" };
    const names = Array.from(
      { length: MAPO_AI_RELATION_SEARCH_MAX + 5 },
      (_, i) => `Name ${i}`,
    );
    const get = vi.fn<Get>(async () => []);

    const found = await resolveMapoAiRelations(
      { blocks: filled(names.map((name) => ({ article: { search: name } }))) },
      [article],
      NO_LISTS,
      { get },
    );

    expect(get).toHaveBeenCalledTimes(MAPO_AI_RELATION_SEARCH_MAX);
    const statuses = (found.blocks ?? []).map((one) =>
      one.failed ? "failed" : one.status,
    );
    expect(statuses.filter((one) => one === "none")).toHaveLength(
      MAPO_AI_RELATION_SEARCH_MAX,
    );
    expect(statuses.filter((one) => one === "failed")).toHaveLength(5);
  });

  it("asks the backend four paths at a time", async () => {
    let active = 0;
    let most = 0;
    const get = vi.fn<Get>(async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [];
    });
    const fields = Array.from({ length: 10 }, (_, i) => ({
      ...CATEGORY,
      path: `field${i}`,
      endpoint: `/api/list${i}`,
    }));

    await listMapoAiRelations(fields, { get });

    expect(get).toHaveBeenCalledTimes(10);
    expect(most).toBe(4);
  });

  it("searches a name once for two fields on one endpoint, and reads the records as each field names them", async () => {
    const byName = { ...CATEGORY, path: "one" };
    const bySlug = {
      ...CATEGORY,
      path: "two",
      itemText: "slug",
      returnObject: true,
    };
    const get = backend({
      "/api/categories?search=culture": [
        { id: 2, name: "Culture", slug: "culture" },
      ],
    });

    const found = await resolveMapoAiRelations(
      {
        one: filled({ search: "culture" }),
        two: filled({ search: "culture" }),
      },
      [byName, bySlug],
      NO_LISTS,
      { get },
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(found.one?.[0]).toMatchObject({
      status: "found",
      value: 2,
      label: "Culture",
    });
    expect(found.two?.[0]).toMatchObject({
      status: "found",
      value: { id: 2, name: "Culture", slug: "culture" },
      label: "culture",
    });
  });
});

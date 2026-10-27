import { describe, expect, it } from "vitest";

import {
  ALL_ROWS,
  formatPageSize,
  nextSorting,
  orderingParam,
  parsePageSize,
  toPageSize,
} from "../runtime/utils/listTable";

describe("nextSorting", () => {
  it("cycles a column through ascending, descending and unsorted", () => {
    const asc = nextSorting([], "title");
    expect(asc).toEqual([{ id: "title", desc: false }]);
    const desc = nextSorting(asc, "title");
    expect(desc).toEqual([{ id: "title", desc: true }]);
    expect(nextSorting(desc, "title")).toEqual([]);
  });

  it("replaces the sort on another column", () => {
    expect(
      nextSorting(
        [
          { id: "title", desc: true },
          { id: "status", desc: false },
        ],
        "created_at",
      ),
    ).toEqual([{ id: "created_at", desc: false }]);
  });

  it("keeps only the clicked key of a multi-column sort", () => {
    // A multi-column sort can come from the URL; a click narrows it to one key.
    expect(
      nextSorting(
        [
          { id: "title", desc: false },
          { id: "status", desc: false },
        ],
        "status",
      ),
    ).toEqual([{ id: "status", desc: true }]);
  });
});

describe("page size helpers", () => {
  it("stores the 'all' option as ALL_ROWS", () => {
    expect(toPageSize("all")).toBe(ALL_ROWS);
    expect(toPageSize(50)).toBe(50);
  });

  it("reads page_size from the URL", () => {
    expect(parsePageSize("all", 20)).toBe(ALL_ROWS);
    expect(parsePageSize("50", 20)).toBe(50);
    expect(parsePageSize("-3", 20)).toBe(20);
    expect(parsePageSize("abc", 20)).toBe(20);
    expect(parsePageSize(undefined, 20)).toBe(20);
  });

  it("writes page_size to the URL", () => {
    expect(formatPageSize(ALL_ROWS)).toBe("all");
    expect(formatPageSize(50)).toBe("50");
  });
});

describe("orderingParam", () => {
  it("joins the keys, with `-` for descending", () => {
    expect(
      orderingParam([
        { id: "title", desc: true },
        { id: "published_at", desc: false },
      ]),
    ).toBe("-title,published_at");
  });

  it("writes a related object's field as a Django lookup", () => {
    expect(orderingParam([{ id: "parent.category.name", desc: true }])).toBe(
      "-parent__category__name",
    );
  });
});

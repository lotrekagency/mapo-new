import { describe, expect, it } from "vitest";

import { nextSorting } from "../runtime/utils/listTable";

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

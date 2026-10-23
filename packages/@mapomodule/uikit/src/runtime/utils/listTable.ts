/** One sort key as `UTable` holds it: the column id and the direction. */
export interface TableSort {
  id: string;
  desc: boolean;
}

/**
 * The page size that stands for "all rows". A plain number, so the paging
 * arithmetic and the in-memory slicing keep working unchanged.
 */
export const ALL_ROWS = Number.MAX_SAFE_INTEGER;

/** A `pageSizeOptions` entry as the table stores it: `"all"` → {@link ALL_ROWS}. */
export function toPageSize(option: number | "all"): number {
  return option === "all" ? ALL_ROWS : option;
}

/** Reads `page_size` from the URL: `all`, or a positive number, else `fallback`. */
export function parsePageSize(value: unknown, fallback: number): number {
  if (value === "all") return ALL_ROWS;
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

/** Writes a page size to the URL: {@link ALL_ROWS} as `all`. */
export function formatPageSize(size: number): string {
  return size === ALL_ROWS ? "all" : String(size);
}

/**
 * The sorting after a click on a sortable header. The column goes from
 * unsorted to ascending, to descending, and back to unsorted, so the natural
 * order (needed by drag reorder) is one click away. It replaces any other key.
 */
export function nextSorting(
  sorting: TableSort[],
  columnId: string,
): TableSort[] {
  const current = sorting.find((sort) => sort.id === columnId);
  if (!current) return [{ id: columnId, desc: false }];
  if (!current.desc) return [{ id: columnId, desc: true }];
  return [];
}

/**
 * The `ordering` param for a sorting: comma-separated keys, `-` for descending.
 * A dotted key becomes a Django lookup (`category.name` → `category__name`),
 * the way DRF's OrderingFilter reaches a field of a related object.
 */
export function orderingParam(sorting: TableSort[]): string {
  return sorting
    .map((sort) => `${sort.desc ? "-" : ""}${sort.id.split(".").join("__")}`)
    .join(",");
}

/** One sort key as `UTable` holds it: the column id and the direction. */
export interface TableSort {
  id: string;
  desc: boolean;
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

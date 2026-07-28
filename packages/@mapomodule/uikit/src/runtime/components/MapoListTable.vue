<script setup lang="ts" generic="T extends object">
import {
  ref,
  shallowRef,
  computed,
  watch,
  h,
  resolveComponent,
  useSlots,
} from "vue";
import type { Ref } from "vue";
import type { TableColumn } from "@nuxt/ui";
import type { SortingState, PaginationState } from "@tanstack/vue-table";
import type { ListColumn } from "../types/list.js";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import type { AnyFieldDescriptor, FieldRegistry } from "@mapomodule/form/types";
import { debounce, splitEndpointParams } from "@mapomodule/utils";
import { useRoute, useRouter } from "vue-router";

const props = withDefaults(
  defineProps<{
    endpoint?: string;
    /**
     * Offline mode: when provided, the table renders this array and applies
     * search/filter/sort/pagination/drag/delete in memory — no API calls.
     * Mutations (drag reorder, delete, quick-edit) emit `update:items` so the
     * parent owns the source of truth.
     */
    items?: T[];
    /**
     * Clean endpoint used for detail / delete / updateOrder CRUD operations.
     * Defaults to `endpoint` with the query string stripped.
     * Pass this explicitly when `endpoint` carries user-configured query params
     * (e.g. `?fields=id,title`) that must not be included in mutation URLs.
     */
    crudEndpoint?: string;
    /**
     * Extra query params merged into every `list()` call (on top of pagination /
     * sort / search). Used by the parent `MapoList` to pass active filter values
     * and tab params without baking them into the endpoint string.
     */
    filterParams?: Record<string, unknown>;
    /** Initial page size. Default: 20. */
    defaultPageSize?: number;
    /** Page size options shown in the per-page selector. Default: [10, 20, 50, 100]. */
    pageSizeOptions?: number[];
    /**
     * Custom response parser. When provided it replaces the built-in DRF / flat-array
     * detection. Return `{ items, total }` from any shape your backend returns.
     * @example (raw) => ({ items: raw.data, total: raw.meta.total })
     */
    responseAdapter?: (raw: unknown) => { items: T[]; total: number };
    /**
     * Custom pagination query params factory. When provided it replaces the default
     * `{ page, page_size }` params. Use this to support offset/limit or cursor pagination.
     * @example ({ page, pageSize }) => ({ offset: (page - 1) * pageSize, limit: pageSize })
     */
    paginationParams?: (state: {
      page: number;
      pageSize: number;
    }) => Record<string, unknown>;
    /**
     * Hybrid mode: when true and `endpoint` is set, the table fetches the
     * full dataset ONCE (no pagination/sort/filter params) and then runs
     * search/filter/sort/pagination locally. Mutations (delete, drag, quick-edit)
     * still hit the backend, then re-fetch. Ignored when `items` is provided.
     */
    clientSide?: boolean;
    columns: ListColumn<T>[];
    lookup?: string;
    searchable?: boolean;
    draggable?: boolean;
    positionField?: string;
    editFields?: AnyFieldDescriptor<T>[];
    languages?: string[];
    registry?: FieldRegistry;
    /** Base path for the detail page. If set, each row shows a link button → `${detailBase}/${item[lookup]}`. */
    detailBase?: string;
    /**
     * Django model name for permission gating (e.g. `"article"`).
     * When provided, the edit and delete row buttons are hidden when the user
     * lacks the corresponding `change` / `delete` permission.
     */
    permissionModel?: string;
  }>(),
  {
    endpoint: "",
    items: undefined,
    clientSide: false,
    lookup: "id",
    searchable: true,
    draggable: false,
    positionField: "position",
    editFields: () => [],
    defaultPageSize: 20,
    pageSizeOptions: () => [10, 20, 50, 100],
  },
);

const offlineMode = computed(() => Array.isArray(props.items));
const hybridMode = computed(() => !offlineMode.value && props.clientSide);

const emit = defineEmits<{
  "update:selection": [value: T[] | "all"];
  "update:selectionQuery": [value: URLSearchParams];
  "update:items": [value: T[]];
}>();

defineExpose({ refresh });

defineSlots<
  {
    /** Extra content rendered alongside the search input in the toolbar. */
    "dtable.toolbar"(): any;
    /** Override for the empty state displayed when no rows are found. */
    "dtable.empty"(): any;
    /** Override for the loading skeleton displayed while data is being fetched. */
    "dtable.loading"(): any;
    /** Catch-all for slots forwarded dynamically (e.g. `qedit.*`). */
    [K: string]: (...args: any[]) => any;
  } & {
    /**
     * Per-column cell override. Slot name: `cell.{column.key}`.
     */
    [K in keyof T as `cell.${K & string}`]: (props: {
      item: T;
      value: T[K];
    }) => any;
  }
>();

const slots = useSlots();

// T extends object but not Record<string,unknown>, so dynamic key access needs a cast.
// Casting the key to keyof T returns the union of all property types rather than `unknown`,
// which is both accurate and avoids any implicit-any errors at the call sites.
const atKey = (item: T, key: string): T[keyof T] => item[key as keyof T];

const snack = useSnackStore();
const confirm = useConfirmStore();

// --- URL state (read once on mount, write on change) ---
const route = useRoute();
const router = useRouter();

// `crudBase` is the clean endpoint path used for detail / delete / updateOrder.
// It strips any query string from `endpoint` so mutations are never sent to a
// URL like `/api/case/?fields=id,title/1/`.
const crudBase =
  props.crudEndpoint ??
  (splitEndpointParams(props.endpoint).path || props.endpoint);
const crud = useCrud<T>(crudBase);

// --- Permissions ---
const { canChange, canDelete: canDeletePerm } = usePermissions();
const canEditRow = computed(
  () => !props.permissionModel || canChange(props.permissionModel),
);
const canDeleteRow = computed(
  () => !props.permissionModel || canDeletePerm(props.permissionModel),
);

// --- Data state ---
// `rows` holds the slice currently rendered (post search/filter/sort/pagination).
// In offline mode, the parent's full array lives in `props.items` and is the
// source of truth; this ref always holds the displayed page.
// shallowRef: rows are always reassigned wholesale (never mutated in place), so
// deep reactivity would only add per-cell Proxy overhead with no benefit.
const rows = shallowRef<T[]>([]) as Ref<T[]>;
// `fullDataset` caches the full server response in hybrid mode. Refilled on
// endpoint change or after a mutation; reused for every filter/sort/page change.
// shallowRef for the same reason — it holds a potentially large dataset that is
// only ever replaced as a whole by `fetchAll`.
const fullDataset = shallowRef<T[]>([]) as Ref<T[]>;
const hybridLoaded = ref(false);
const total = ref(0);
const loading = ref(false);

function toPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// --- Pagination (restored from URL) ---
const pagination = ref<PaginationState>({
  pageIndex: route.query.page
    ? Math.max(0, toPositiveNumber(route.query.page, 1) - 1)
    : 0,
  pageSize: route.query.page_size
    ? toPositiveNumber(route.query.page_size, props.defaultPageSize)
    : props.defaultPageSize,
});

// --- Sorting (restored from URL) ---
const sorting = ref<SortingState>(
  route.query.ordering
    ? String(route.query.ordering)
        .split(",")
        .map((o) => ({
          id: o.startsWith("-") ? o.slice(1) : o,
          desc: o.startsWith("-"),
        }))
    : [],
);

// --- Search (restored from URL) ---
const search = ref(route.query.search ? String(route.query.search) : "");

// Debounce the search input through the shared util (same mechanism as writeUrlState),
// resetting to the first page so results aren't hidden on a stale page index.
const onSearchInput = debounce((val: unknown) => {
  search.value = String(val ?? "");
  pagination.value = { ...pagination.value, pageIndex: 0 };
}, 350);

// Write pagination / sorting / search to the URL (debounced to avoid history spam).
const writeUrlState = debounce(() => {
  const query: Record<string, string | undefined> = {
    ...(route.query as Record<string, string>),
  };
  const page = pagination.value.pageIndex + 1;
  if (page > 1) query.page = String(page);
  else delete query.page;
  if (pagination.value.pageSize !== props.defaultPageSize)
    query.page_size = String(pagination.value.pageSize);
  else delete query.page_size;
  if (search.value) query.search = search.value;
  else delete query.search;
  if (sorting.value.length)
    query.ordering = sorting.value
      .map((s: { id: string; desc: boolean }) => `${s.desc ? "-" : ""}${s.id}`)
      .join(",");
  else delete query.ordering;
  router.replace({ query });
}, 150);

watch([pagination, search, sorting], writeUrlState, { deep: true });

// --- Row selection ---
// Selection is keyed by primary key (lookup), not by row index, so pagination/sort/refresh
// changes do not affect which rows are marked as selected.
const rowSelection = ref<Record<string, boolean>>({});
const pkOf = (row: T) => String(atKey(row, props.lookup));
const isAllSelected = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every((r) => rowSelection.value[pkOf(r)]),
);
const isIndeterminate = computed(() => {
  const some = rows.value.some((r) => rowSelection.value[pkOf(r)]);
  return some && !isAllSelected.value;
});

const selectedRows = computed<T[]>(() =>
  rows.value.filter((r) => rowSelection.value[pkOf(r)]),
);
watch(selectedRows, (rows) => {
  emit("update:selection", rows);
  emit("update:selectionQuery", buildSelectionQuery());
});

function buildSelectionQuery(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page_size", String(pagination.value.pageSize));
  if (search.value) params.set("search", search.value);
  sorting.value.forEach((s) =>
    params.set("ordering", `${s.desc ? "-" : ""}${s.id}`),
  );
  return params;
}

function toggleAll() {
  if (isAllSelected.value) {
    const next = { ...rowSelection.value };
    for (const r of rows.value) delete next[pkOf(r)];
    rowSelection.value = next;
  } else {
    const next = { ...rowSelection.value };
    for (const r of rows.value) next[pkOf(r)] = true;
    rowSelection.value = next;
  }
}

function toggleRowByKey(key: string) {
  const next = { ...rowSelection.value };
  if (next[key]) delete next[key];
  else next[key] = true;
  rowSelection.value = next;
}

// --- Quick edit ---
const quickEditOpen = ref(false);
const quickEditId = ref<string | number | null>(null);

function openQuickEdit(id: string | number) {
  quickEditId.value = id;
  quickEditOpen.value = true;
}

// In offline mode, the quick-edit modal emits the locally edited item; we
// splice it back into the parent's array and emit `update:items` (no BE call).
function onQuickEditSaved(updated: T) {
  if (offlineMode.value) {
    const lk = props.lookup;
    const next = (props.items ?? []).map((r) =>
      String(atKey(r, lk)) === String(atKey(updated, lk)) ? updated : r,
    );
    emit("update:items", next);
    return;
  }
  if (hybridMode.value) hybridLoaded.value = false;
  refresh();
}

// Look up the item currently being edited in the source array (offline mode only).
const quickEditLocalItem = computed<T | null>(() => {
  if (!offlineMode.value || quickEditId.value == null) return null;
  return (
    (props.items ?? []).find(
      (r) => String(atKey(r, props.lookup)) === String(quickEditId.value),
    ) ?? null
  );
});

// --- Delete ---
async function deleteRow(item: T) {
  const ok = await confirm.ask({
    title: "Delete item",
    message: "Are you sure you want to delete this item?",
    confirmText: "Delete",
    dangerous: true,
  });
  if (!ok) return;
  if (offlineMode.value) {
    const next = (props.items ?? []).filter(
      (r) =>
        String(atKey(r, props.lookup)) !== String(atKey(item, props.lookup)),
    );
    emit("update:items", next);
    snack.show("Item deleted", "success");
    return;
  }
  try {
    await crud.delete(atKey(item, props.lookup) as string | number);
    snack.show("Item deleted", "success");
    if (hybridMode.value) hybridLoaded.value = false;
    refresh();
  } catch {
    snack.show("Failed to delete item", "error");
  }
}

// --- Drag reorder ---
// Reorder is only meaningful in the natural order, so it is disabled while a search or
// column sort is active (the displayed order would not match the persisted one).
const canReorder = computed(
  () => props.draggable && !search.value && sorting.value.length === 0,
);

const tableWrapper = ref<HTMLElement | null>(null);
const dragFrom = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function rowElements(): HTMLElement[] {
  return tableWrapper.value
    ? Array.from(tableWrapper.value.querySelectorAll<HTMLElement>("tbody tr"))
    : [];
}

function clearRowClasses() {
  for (const el of rowElements())
    el.classList.remove(
      "mapo-drop-before",
      "mapo-drop-after",
      "mapo-drag-source",
    );
}

function clearDragState() {
  clearRowClasses();
  dragFrom.value = null;
  dragOverIndex.value = null;
}

function onDragStart(idx: number) {
  if (!canReorder.value) return;
  dragFrom.value = idx;
}

// Drop area = the whole row. UTable owns the <tr>, so drag events are delegated on the
// wrapper and the target row is resolved from the event target.
function onRowDragOver(e: DragEvent) {
  if (dragFrom.value === null) return;
  e.preventDefault(); // required to allow a drop
  const tr = (e.target as HTMLElement | null)?.closest(
    "tbody tr",
  ) as HTMLElement | null;
  if (!tr) return;
  const els = rowElements();
  const idx = els.indexOf(tr);
  if (idx < 0) return;
  const rect = tr.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  clearRowClasses();
  tr.classList.add(before ? "mapo-drop-before" : "mapo-drop-after");
  els[dragFrom.value]?.classList.add("mapo-drag-source");
  dragOverIndex.value = idx;
}

function onRowDrop(e: DragEvent) {
  e.preventDefault();
  const from = dragFrom.value;
  const to = dragOverIndex.value;
  clearDragState();
  if (from !== null && to !== null) void onDrop(from, to);
}

function onDragEnd() {
  clearDragState();
}

async function onDrop(fromIdx: number, toIdx: number) {
  if (fromIdx === toIdx) return;
  const arr = [...rows.value];
  const moved = arr[fromIdx]!;
  const target = arr[toIdx]!;
  arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);
  rows.value = arr as T[];
  if (offlineMode.value) {
    // Reorder against the parent's full array (rows is only the current page).
    const lk = props.lookup;
    const full = [...(props.items ?? [])];
    const fIdx = full.findIndex(
      (r) => String(atKey(r, lk)) === String(atKey(moved, lk)),
    );
    const tIdx = full.findIndex(
      (r) => String(atKey(r, lk)) === String(atKey(target, lk)),
    );
    if (fIdx >= 0 && tIdx >= 0) {
      const [m] = full.splice(fIdx, 1);
      full.splice(tIdx, 0, m!);
      emit("update:items", full);
    }
    return;
  }
  // Persist the new order in a single request: the backend (Camomilla updateOrder)
  // recalculates positions server-side, avoiding N parallel PATCHes and race conditions.
  try {
    await crud.updateOrder(
      atKey(moved, props.lookup) as string | number,
      atKey(target, props.lookup) as string | number,
    );
    snack.show("Order saved", "success");
    if (hybridMode.value) {
      hybridLoaded.value = false;
      refresh();
    }
  } catch {
    snack.show("Failed to save order", "error");
    refresh();
  }
}

// --- Offline pipeline: apply search/filter/sort/pagination in memory. ---
function applyOffline(source: T[]) {
  let arr = [...source];

  // Search: case-insensitive substring across all declared column keys.
  if (search.value) {
    const q = search.value.toLowerCase();
    arr = arr.filter((row) =>
      props.columns.some((c) =>
        String(row[c.key] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }

  // Filters + tab (filterParams): values use the v1 comma-joined format.
  // - two ISO dates  → inclusive [start, end] range (datepicker filter)
  // - multiple values → set inclusion (multi-choice filter)
  // - single value    → equality
  for (const [key, rawVal] of Object.entries(props.filterParams ?? {})) {
    if (rawVal == null || rawVal === "") continue;
    const parts = String(rawVal).split(",");
    const isDateRange =
      parts.length === 2 && parts.every((p) => !Number.isNaN(Date.parse(p)));
    if (isDateRange) {
      const [start, end] = parts;
      arr = arr.filter((row) => {
        const v = atKey(row, key);
        if (v == null) return false;
        const s = String(v);
        return s >= start! && s <= end!;
      });
    } else if (parts.length > 1) {
      const set = new Set(parts);
      arr = arr.filter((row) => set.has(String(atKey(row, key))));
    } else {
      arr = arr.filter((row) => String(atKey(row, key)) === parts[0]);
    }
  }

  // Sort: multi-column. Sorting columns are applied in order, each acting as
  // a tiebreaker for the previous one (matches TanStack's default behavior).
  if (sorting.value.length) {
    const sortDefs = sorting.value;
    arr.sort((a, b) => {
      for (const s of sortDefs) {
        const av = atKey(a, s.id);
        const bv = atKey(b, s.id);
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return s.desc ? 1 : -1;
        if (av > bv) return s.desc ? -1 : 1;
      }
      return 0;
    });
  }

  total.value = arr.length;

  // Recover from a stale page index (e.g. URL ?page=99 on a 3-row dataset).
  const start = pagination.value.pageIndex * pagination.value.pageSize;
  if (arr.length > 0 && start >= arr.length) {
    pagination.value = { ...pagination.value, pageIndex: 0 };
    rows.value = arr.slice(0, pagination.value.pageSize) as T[];
    return;
  }

  rows.value = arr.slice(start, start + pagination.value.pageSize) as T[];
}

// --- Hybrid: fetch the full dataset once, then run applyOffline on it. ---
async function fetchAll() {
  loading.value = true;
  try {
    const endpointParams = splitEndpointParams(props.endpoint).params;
    const res = await crud.list(endpointParams as Record<string, string>);
    let nextItems: T[] = [];
    if (props.responseAdapter) {
      nextItems = props.responseAdapter(res).items;
    } else if (res && typeof res === "object" && "results" in res) {
      nextItems = (res as { results: T[] }).results;
    } else {
      nextItems = res as unknown as T[];
    }
    fullDataset.value = nextItems;
    hybridLoaded.value = true;
  } catch {
    snack.show("Failed to load data", "error");
  } finally {
    loading.value = false;
  }
}

// --- Fetch ---
async function refresh() {
  if (offlineMode.value) {
    applyOffline(props.items ?? []);
    return;
  }
  if (hybridMode.value) {
    if (!hybridLoaded.value) await fetchAll();
    applyOffline(fullDataset.value);
    return;
  }
  loading.value = true;
  try {
    // Extract any query params the caller baked into the endpoint (e.g. ?fields=id,title).
    const endpointParams = splitEndpointParams(props.endpoint).params;

    const pageState = {
      page: pagination.value.pageIndex + 1,
      pageSize: pagination.value.pageSize,
    };
    const paginationP = props.paginationParams
      ? props.paginationParams(pageState)
      : { page: pageState.page, page_size: pageState.pageSize };

    const params: Record<string, unknown> = {
      ...endpointParams,
      ...(props.filterParams ?? {}),
      ...paginationP,
    };
    if (search.value) params.search = search.value;
    if (sorting.value.length)
      params.ordering = sorting.value
        .map((s) => `${s.desc ? "-" : ""}${s.id}`)
        .join(",");

    const res = await crud.list(params as Record<string, string>);

    let nextItems: T[] = [];
    let nextTotal = 0;

    if (props.responseAdapter) {
      const adapted = props.responseAdapter(res);
      nextItems = adapted.items;
      nextTotal = adapted.total;
    } else if (res && typeof res === "object" && "results" in res) {
      nextItems = (res as { results: T[]; count: number }).results;
      nextTotal = (res as { results: T[]; count: number }).count;
    } else {
      nextItems = res as unknown as T[];
      nextTotal = (res as unknown as T[]).length;
    }

    // Recover from stale URL pagination (e.g. page=99) that yields an empty
    // page while the dataset still has rows. Reset to first page and re-fetch.
    if (
      nextItems.length === 0 &&
      nextTotal > 0 &&
      pagination.value.pageIndex > 0
    ) {
      pagination.value = { ...pagination.value, pageIndex: 0 };
      return;
    }

    rows.value = nextItems;
    total.value = nextTotal;
  } catch {
    snack.show("Failed to load data", "error");
  } finally {
    loading.value = false;
  }
}

// Invalidate the hybrid cache whenever the endpoint or mode changes.
watch([() => props.endpoint, () => props.clientSide], () => {
  hybridLoaded.value = false;
});

// Serialize filterParams to detect deep changes without a deep watcher on the array.
const filterParamsKey = computed(() =>
  JSON.stringify(props.filterParams ?? {}),
);

// Watch all sources that should trigger a refresh.
// When the endpoint or filter context changes, reset to page 1 first.
watch(
  [
    () => props.endpoint,
    () => props.items,
    filterParamsKey,
    () => pagination.value.pageIndex,
    () => pagination.value.pageSize,
    sorting,
    search,
  ],
  ([newEndpoint, , newFilters], [oldEndpoint, , oldFilters]) => {
    const contextChanged =
      newEndpoint !== oldEndpoint || newFilters !== oldFilters;
    if (contextChanged && pagination.value.pageIndex !== 0) {
      pagination.value = { ...pagination.value, pageIndex: 0 };
    } else {
      refresh();
    }
  },
  { immediate: true, deep: true },
);

// --- TanStack column defs ---
const UCheckbox = resolveComponent("UCheckbox");
const UButton = resolveComponent("UButton");
const UIcon = resolveComponent("UIcon");

const tableColumns = computed<TableColumn<T>[]>(() => {
  const cols: TableColumn<T>[] = [];

  // Checkbox column
  cols.push({
    id: "__select__",
    header: () =>
      h(UCheckbox, {
        modelValue: isAllSelected.value,
        indeterminate: isIndeterminate.value,
        "onUpdate:modelValue": toggleAll,
        ariaLabel: "Select all rows",
      }),
    cell: ({ row }: { row: { original: T } }) => {
      const k = pkOf(row.original);
      return h(UCheckbox, {
        modelValue: !!rowSelection.value[k],
        "onUpdate:modelValue": () => toggleRowByKey(k),
        ariaLabel: "Select row",
      });
    },
    meta: { class: { th: "w-10", td: "w-10" } },
  } as TableColumn<T>);

  // Drag handle column
  if (props.draggable) {
    cols.push({
      id: "__drag__",
      header: "",
      cell: ({ row }: { row: { index: number } }) =>
        h(
          "span",
          {
            class: canReorder.value
              ? "cursor-grab text-muted"
              : "cursor-not-allowed text-muted opacity-30",
            draggable: canReorder.value,
            title: canReorder.value
              ? "Drag to reorder"
              : "Clear search & sorting to reorder",
            onDragstart: (e: DragEvent) => {
              e.dataTransfer?.setData("text/plain", "");
              onDragStart(row.index);
            },
          },
          h(UIcon, { name: "i-lucide-grip-vertical", class: "h-4 w-4" }),
        ),
      meta: { class: { th: "w-8", td: "w-8" } },
    } as TableColumn<T>);
  }

  // Data columns — the first column gets a navigation link when `detailBase` is set.
  // Any column can be overridden with a `cell.{key}` slot (receives `{ item, value }`).
  const NuxtLink = resolveComponent("NuxtLink");
  for (let i = 0; i < props.columns.length; i++) {
    const col = props.columns[i]!;
    const isFirst = i === 0 && !!props.detailBase;
    cols.push({
      accessorKey: col.key,
      header: col.label,
      cell: ({ row }: { row: { original: T } }) => {
        const cellSlot = slots[`cell.${col.key}`];
        if (cellSlot)
          return cellSlot({
            item: row.original,
            value: atKey(row.original, col.key),
          });
        const cellVal = atKey(row.original, col.key);
        if (isFirst) {
          return h(
            NuxtLink,
            {
              to: `${props.detailBase}/${atKey(row.original, props.lookup)}`,
              class: "font-medium hover:underline",
            },
            () => String(cellVal ?? "—"),
          );
        }
        return String(cellVal ?? "—");
      },
      meta: { class: { td: col.class ?? "" } },
    } as TableColumn<T>);
  }

  // Actions column
  cols.push({
    id: "__actions__",
    header: "",
    cell: ({ row }: { row: { original: T } }) => {
      const buttons: ReturnType<typeof h>[] = [];
      if (props.editFields.length > 0 && canEditRow.value) {
        buttons.push(
          h(UButton, {
            size: "xs",
            variant: "ghost",
            color: "neutral",
            icon: "i-lucide-pencil",
            onClick: () =>
              openQuickEdit(
                atKey(row.original, props.lookup) as string | number,
              ),
          }),
        );
      }
      if (canDeleteRow.value) {
        buttons.push(
          h(UButton, {
            size: "xs",
            variant: "ghost",
            color: "error",
            icon: "i-lucide-trash-2",
            onClick: () => deleteRow(row.original),
          }),
        );
      }
      return h(
        "div",
        { class: "flex items-center gap-1 justify-end" },
        buttons,
      );
    },
    meta: { class: { th: "text-right", td: "text-right" } },
  } as TableColumn<T>);

  return cols;
});

// --- Pagination for UTable ---
const paginationOptions = computed(() => ({
  manualPagination: true,
  rowCount: total.value,
}));

const sortingOptions = computed(() => ({
  manualSorting: true,
}));
</script>

<template>
  <div class="mapo-list-table space-y-3">
    <!-- Search -->
    <div v-if="searchable" class="flex items-center gap-2">
      <UInput
        :model-value="search"
        placeholder="Search..."
        icon="i-lucide-search"
        size="sm"
        class="max-w-xs"
        @update:model-value="onSearchInput"
      />
      <slot name="dtable.toolbar" />
    </div>

    <!-- Table — the drop area spans the whole row via delegated DnD on this wrapper. -->
    <div
      ref="tableWrapper"
      @dragover="onRowDragOver"
      @drop="onRowDrop"
      @dragend="onDragEnd"
    >
      <UTable
        :data="rows"
        :columns="tableColumns"
        :loading="loading"
        :pagination="pagination"
        :pagination-options="paginationOptions"
        :sorting="sorting"
        :sorting-options="sortingOptions"
        empty="No items found"
        @update:pagination="pagination = $event ?? pagination"
        @update:sorting="sorting = $event ?? sorting"
      >
        <template #empty>
          <slot name="dtable.empty">
            <div class="flex flex-col items-center gap-2 py-8 text-muted">
              <UIcon name="i-lucide-inbox" class="h-8 w-8" />
              <span class="text-sm">No items found</span>
            </div>
          </slot>
        </template>

        <template #loading>
          <slot name="dtable.loading">
            <div class="flex justify-center py-8">
              <UIcon
                name="i-lucide-loader-circle"
                class="h-6 w-6 animate-spin text-muted"
              />
            </div>
          </slot>
        </template>
      </UTable>
    </div>

    <!-- Pagination controls -->
    <div class="flex items-center justify-between text-sm text-muted">
      <span>{{ total }} items</span>
      <UPagination
        :model-value="pagination.pageIndex + 1"
        :total="total"
        :items-per-page="pagination.pageSize"
        size="sm"
        @update:model-value="
          pagination = { ...pagination, pageIndex: $event - 1 }
        "
      />
      <USelect
        :model-value="pagination.pageSize"
        :items="
          pageSizeOptions.map((n) => ({ label: `${n} / page`, value: n }))
        "
        size="xs"
        class="w-28"
        @update:model-value="
          pagination = { pageIndex: 0, pageSize: Number($event) }
        "
      />
    </div>

    <!-- Quick edit modal -->
    <MapoListQuickEdit
      v-if="editFields.length > 0"
      v-model:open="quickEditOpen"
      :endpoint="crudBase"
      :item-id="quickEditId"
      :edit-fields="editFields"
      :lookup="lookup"
      :languages="languages"
      :registry="registry"
      :offline="offlineMode"
      :local-item="quickEditLocalItem"
      @saved="onQuickEditSaved"
    >
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="`qedit.${String(name)}`" v-bind="slotProps ?? {}" />
      </template>
    </MapoListQuickEdit>
  </div>
</template>

<style scoped>
/* Drag-reorder visual feedback. Classes are toggled imperatively on UTable's <tr>
   elements (UTable owns that DOM), so :deep() is required to reach them. */
.mapo-list-table :deep(tbody tr.mapo-drag-source) {
  opacity: 0.4;
}
.mapo-list-table :deep(tbody tr.mapo-drop-before > td) {
  box-shadow: inset 0 2px 0 0 var(--ui-primary, #3b82f6);
}
.mapo-list-table :deep(tbody tr.mapo-drop-after > td) {
  box-shadow: inset 0 -2px 0 0 var(--ui-primary, #3b82f6);
}
</style>

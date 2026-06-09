<script setup lang="ts" generic="T extends object">
import { ref, computed, watch } from "vue";
import type { Ref } from "vue";
import type {
  ListColumn,
  FilterDescriptor,
  FilterChoice,
  ActiveFilter,
  ActionDescriptor,
  ListTabItem,
} from "../types/list.js";
import type { FieldDescriptor, FieldRegistry } from "@mapomodule/form/types";
import { debounce } from "@mapomodule/utils";
import {
  useRoute,
  useRouter,
  // @ts-expect-error — #imports is a Nuxt virtual module resolved at app build time
} from "#imports";

const props = withDefaults(
  defineProps<{
    endpoint?: string;
    /**
     * Offline mode: pass a local array to drive the list entirely in memory.
     * Search, filters, sort, pagination, drag-reorder and delete all happen
     * client-side. Mutations emit `update:items` so the parent owns the array.
     * When set, `endpoint` is ignored.
     */
    items?: T[];
    /**
     * Hybrid mode: with `endpoint` set and `clientSide: true`, the list fetches
     * the full dataset ONCE and runs search/filter/sort/pagination locally.
     * Mutations (delete, drag, quick-edit) still hit the backend, then refetch.
     * Ignored when `items` is provided.
     */
    clientSide?: boolean;
    columns: ListColumn<T>[];
    lookup?: string;
    // Filters
    filters?: FilterDescriptor[];
    // Actions
    actions?: ActionDescriptor<T>[];
    // Tabs
    tabs?: ListTabItem[];
    defaultTab?: string;
    tabQueryParam?: string;
    // Table features
    searchable?: boolean;
    draggable?: boolean;
    positionField?: string;
    // Quick edit
    editFields?: FieldDescriptor<T>[];
    languages?: string[];
    registry?: Partial<FieldRegistry>;
    /** Base path for the detail page link on each row. E.g. "/news" → links to "/news/42". */
    detailBase?: string;
    /**
     * Django model label used to gate row-level edit and delete buttons via permissions.
     * E.g. `"article"` hides the pencil unless the user has `change_article`, and
     * hides the trash unless the user has `delete_article`. Omit to always show both.
     */
    permissionModel?: string;
    // Pagination
    /** Initial page size. Default: 20. */
    defaultPageSize?: number;
    /** Page size options shown in the per-page selector. Default: [10, 20, 50, 100]. */
    pageSizeOptions?: number[];
    /**
     * Custom response parser. Replaces the built-in DRF / flat-array detection.
     * Return `{ items, total }` from any shape your backend returns.
     * @example (raw) => ({ items: raw.data, total: raw.meta.total })
     */
    responseAdapter?: (raw: unknown) => { items: T[]; total: number };
    /**
     * Custom pagination query params factory. Replaces default `{ page, page_size }`.
     * @example ({ page, pageSize }) => ({ offset: (page - 1) * pageSize, limit: pageSize })
     */
    paginationParams?: (state: {
      page: number;
      pageSize: number;
    }) => Record<string, unknown>;
  }>(),
  {
    endpoint: "",
    items: undefined,
    clientSide: false,
    lookup: "id",
    filters: () => [],
    actions: () => [],
    tabs: () => [],
    tabQueryParam: "tab",
    searchable: true,
    draggable: false,
    positionField: "position",
    editFields: () => [],
    defaultPageSize: 20,
    pageSizeOptions: () => [10, 20, 50, 100],
  },
);

const emit = defineEmits<{
  "update:items": [value: T[]];
}>();

// --- URL state (read once on mount, then write on change) ---
const route = useRoute();
const router = useRouter();

// --- Selection state ---
const selection = ref<T[] | "all">([]) as Ref<T[] | "all">;
const selectionQuery = ref(new URLSearchParams());

// --- Tabs state (restored from URL) ---
function restoreTabFromUrl(): string {
  const urlTab = route.query[props.tabQueryParam] as string | undefined;
  if (urlTab && props.tabs.some((t) => t.value === urlTab)) return urlTab;
  return props.defaultTab ?? props.tabs[0]?.value ?? "";
}
const activeTab = ref(restoreTabFromUrl());

// --- Filters state (restored from URL) ---
function restoreFiltersFromUrl(): ActiveFilter[] {
  const result: ActiveFilter[] = [];
  for (const fd of props.filters) {
    const urlVal = route.query[`f_${fd.value}`];
    if (!urlVal) continue;
    const rawValue = String(urlVal);
    let active: FilterChoice[];
    if (fd.datepicker) {
      const parts = rawValue.split(",");
      if (parts.length === 2) {
        active = [
          {
            text: parts
              .map((d) => new Date(d).toLocaleDateString())
              .join(" → "),
            value: rawValue,
          },
        ];
      } else continue;
    } else {
      const rawValues = rawValue.split(",");
      active = rawValues
        .map((rv) => fd.choices?.find((c) => String(c.value) === rv))
        .filter(Boolean) as FilterChoice[];
    }
    if (active.length) result.push({ ...fd, active });
  }
  return result;
}
const activeFilters = ref<ActiveFilter[]>(restoreFiltersFromUrl());

// Write current tab + filter state back to URL (debounced to avoid history spam).
const writeUrlState = debounce(() => {
  const query: Record<string, string | undefined> = {
    ...(route.query as Record<string, string>),
  };
  // Tab
  if (props.tabs.length) {
    if (activeTab.value) query[props.tabQueryParam] = activeTab.value;
    else delete query[props.tabQueryParam];
  }
  // Remove stale f_ params, then re-write current ones
  for (const k of Object.keys(query)) {
    if (k.startsWith("f_")) delete query[k];
  }
  for (const f of activeFilters.value) {
    if (!f.active.length) continue;
    query[`f_${f.value}`] = f.active.map((c) => String(c.value)).join(",");
  }
  router.replace({ query });
}, 150);

watch([activeTab, activeFilters], writeUrlState, { deep: true });

// --- crudEndpoint: base path for mutations (no query string). ---
const crudEndpoint = computed(
  () => (props.endpoint ?? "").split("?")[0] || (props.endpoint ?? ""),
);

// --- filterParams: active tab + active filters → backend query params. ---
// v1 contract: each filter is sent as `filter.value=v1,v2,...` (bare key, comma-joined
// values). Datepicker ranges are a single `key=start,end` value (no __gte/__lte split).
// This keeps the backend contract identical to Mapo v1; the `f_` prefix is used only for
// URL persistence (see writeUrlState), never towards the backend.
const filterParams = computed<Record<string, unknown>>(() => {
  const params: Record<string, unknown> = {};
  if (props.tabs.length && activeTab.value) {
    params[props.tabQueryParam] = activeTab.value;
  }
  for (const f of activeFilters.value) {
    if (!f.active.length) continue;
    params[f.value] = f.active.map((c) => String(c.value)).join(",");
  }
  return params;
});

// --- Table ref for refresh ---
const tableRef = ref<{ refresh: () => void } | null>(null);

function refresh() {
  tableRef.value?.refresh();
}

defineExpose({ refresh });

defineSlots<
  {
    /** Content rendered inside the list head area (title, breadcrumbs, action buttons). */
    head(): unknown;
    /** Extra content rendered alongside the search input in the table toolbar. */
    "dtable.toolbar"(): unknown;
    /** Override for the empty state displayed when no rows are found. */
    "dtable.empty"(): unknown;
    /** Override for the loading skeleton displayed while data is being fetched. */
    "dtable.loading"(): unknown;
    /**
     * Per-filter custom panel content. Slot name: `filter.{filter.value}`.
     * Receives `{ filter, toggleChoice, removeFilter }`.
     */
    [K: `filter.${string}`]: (props: {
      filter: FilterDescriptor & { dates?: string[] };
      toggleChoice: (filter: FilterDescriptor, choice: FilterChoice) => void;
      removeFilter: (filter: FilterDescriptor) => void;
    }) => unknown;
    /**
     * Extra content rendered below the quick-edit form.
     * Receives `{ model: T }` — the current reactive form model.
     */
    "qedit.extra": (props: { model: T }) => unknown;
    // catch-all required so $slots[dynamicName] in the forwarding templates type-checks
    [K: string]: (...args: any[]) => unknown;
  } & {
    /**
     * Per-column cell override. Slot name: `cell.{column.key}`.
     */
    [K in keyof T as `cell.${K & string}`]: (props: {
      item: T;
      value: T[K];
    }) => unknown;
  }
>();

// Reset selection when the active tab or filters change
watch([activeTab, activeFilters], () => {
  selection.value = [];
});
</script>

<template>
  <div class="mapo-list space-y-4">
    <!-- Head slot -->
    <MapoListHead>
      <template #head>
        <slot name="head" />
      </template>
    </MapoListHead>

    <!-- Tabs -->
    <MapoListTabs
      v-if="tabs.length"
      :tabs="tabs"
      :model-value="activeTab"
      @update:model-value="activeTab = $event"
    />

    <!-- Toolbar: filters + actions -->
    <div class="flex flex-wrap items-center gap-2">
      <MapoListFilters
        :filters="filters"
        :model-value="activeFilters"
        @update:model-value="activeFilters = $event"
      >
        <template v-for="(_, name) in $slots" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps ?? {}" />
        </template>
      </MapoListFilters>

      <div class="ml-auto">
        <MapoListActions
          :actions="actions"
          :selection="selection"
          :selection-query="selectionQuery"
          :endpoint="crudEndpoint"
          :lookup="lookup"
          @action-completed="refresh"
        />
      </div>
    </div>

    <!-- Table -->
    <MapoListTable
      ref="tableRef"
      :endpoint="endpoint"
      :items="items"
      :client-side="clientSide"
      :crud-endpoint="crudEndpoint"
      :filter-params="filterParams"
      :columns="columns"
      :lookup="lookup"
      :searchable="searchable"
      :draggable="draggable"
      :position-field="positionField"
      :edit-fields="editFields"
      :languages="languages"
      :registry="registry"
      :detail-base="detailBase"
      :default-page-size="defaultPageSize"
      :page-size-options="pageSizeOptions"
      :response-adapter="responseAdapter"
      :pagination-params="paginationParams"
      :permission-model="permissionModel"
      @update:selection="selection = $event"
      @update:selection-query="selectionQuery = $event"
      @update:items="emit('update:items', $event)"
    >
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>
    </MapoListTable>
  </div>
</template>

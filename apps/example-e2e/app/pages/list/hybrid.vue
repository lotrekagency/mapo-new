<script setup lang="ts">
// ─────────────────────────────────────────────────────────────────────────────
// MapoList — HYBRID mode example
//
// Passing `endpoint` + `client-side` puts MapoList in hybrid mode:
//   1. On mount, a single `list()` call fetches the full dataset (no pagination
//      / sort / filter params are sent).
//   2. The response is cached in MapoListTable; every subsequent change to
//      filters, tabs, search, sort or page is applied IN MEMORY — zero network.
//   3. Real mutations still go to the backend:
//        delete  → DELETE /api/articles/{id}/ + refetch
//        drag    → POST   /api/articles/update_order/ + refetch
//        save    → PATCH  /api/articles/{id}/        + refetch
//
// Tradeoff: the BE must be able to return the full list at once. Below we add
// `?page_size=1000` to the endpoint because the mock paginates by default.
// On a real DRF backend you'd either set page_size high or expose an
// un-paginated variant of the same endpoint.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  ListColumn,
  FilterDescriptor,
  ListTabItem,
} from "@mapomodule/uikit/types";
import { formatDate } from "@mapomodule/utils";

definePageMeta({
  layout: "mapo-default",
  label: "List — Hybrid",
  icon: "i-lucide-cloud-cog",
  middleware: ["auth"],
});

interface Article {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "review" | "ready" | "published" | "archived";
  featured: boolean;
  reading_time: number;
  created_at: string;
  category: number | null;
  excerpt: string;
}

const columns: ListColumn<Article>[] = [
  { key: "title", label: "Title", sortable: true, class: "font-medium" },
  { key: "status", label: "Status", sortable: false },
  { key: "featured", label: "Featured", sortable: true, class: "text-center" },
  {
    key: "reading_time",
    label: "Read time",
    sortable: true,
    class: "text-center",
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    class: "text-right text-sm",
  },
];

const filters: FilterDescriptor[] = [
  {
    value: "status",
    text: "Status",
    multiple: true,
    choices: [
      { text: "Draft", value: "draft" },
      { text: "Review", value: "review" },
      { text: "Ready", value: "ready" },
      { text: "Published", value: "published" },
      { text: "Archived", value: "archived" },
    ],
  },
  {
    value: "featured",
    text: "Featured",
    multiple: false,
    choices: [
      { text: "Yes", value: "true" },
      { text: "No", value: "false" },
    ],
  },
];

const tabs: ListTabItem[] = [
  { text: "All", value: "" },
  { text: "Draft", value: "draft" },
  { text: "Published", value: "published" },
  { text: "Archived", value: "archived" },
];

// The mock /api/articles endpoint paginates by default. To exercise hybrid
// properly we ask for a large page so we get the full dataset in one call.
const endpoint = "/api/articles?page_size=1000";

// responseAdapter unwraps DRF's `{ results, count }` envelope into MapoList's
// `{ items, total }` contract. In hybrid mode only `items` is used (total is
// recomputed locally after filtering), but the adapter is shared with server
// mode and must return both fields.
function responseAdapter(raw: unknown): { items: Article[]; total: number } {
  if (raw && typeof raw === "object" && "results" in raw) {
    const r = raw as { results: Article[]; count: number };
    return { items: r.results, total: r.count };
  }
  return { items: [], total: 0 };
}

const statusColors: Record<string, "success" | "warning" | "neutral" | "info"> =
  {
    published: "success",
    draft: "warning",
    review: "info",
    ready: "info",
    archived: "neutral",
  };
</script>

<template>
  <div class="space-y-4">
    <div class="px-6 pt-4">
      <h1 class="text-3xl font-bold text-highlighted">List — Hybrid mode</h1>
      <p class="text-sm text-muted mt-1">
        Fetches <code>/api/articles</code> <strong>once</strong>, then runs
        search, filters, tabs, sort and pagination client-side. Open DevTools
        network: you'll see one request on load, none on subsequent
        interactions. Delete / drag / quick-edit still hit the backend and
        trigger a refetch.
      </p>
    </div>

    <div class="px-6 pb-2">
      <!--
        endpoint                 → GET on mount only (full dataset cached).
        client-side              → switches to hybrid mode; filter/sort/page in memory.
        tab-query-param="status" → tab value drives the local `status` filter.
        response-adapter         → unwraps DRF `{ results, count }` envelope.
      -->
      <MapoList
        :endpoint="endpoint"
        client-side
        tab-query-param="status"
        :columns="columns"
        :filters="filters"
        :tabs="tabs"
        :response-adapter="responseAdapter"
        lookup="id"
        searchable
        :default-page-size="10"
        :page-size-options="[10, 20, 50]"
      >
        <template #[`cell.status`]="{ value }">
          <UBadge
            :color="statusColors[value as string] ?? 'neutral'"
            variant="soft"
            size="sm"
          >
            {{ value }}
          </UBadge>
        </template>

        <template #[`cell.featured`]="{ value }">
          <div class="flex justify-center">
            <UIcon
              :name="value ? 'i-lucide-star' : 'i-lucide-star-off'"
              :class="['size-4', value ? 'text-yellow-500' : 'text-muted']"
            />
          </div>
        </template>

        <template #[`cell.reading_time`]="{ value }">
          <span class="text-xs text-muted">{{ value }}m</span>
        </template>

        <template #[`cell.created_at`]="{ value }">
          <span class="text-xs text-muted">{{
            formatDate(value as string)
          }}</span>
        </template>

        <template #[`dtable.toolbar`]>
          <div class="text-xs text-muted px-2">
            ⚡ One fetch on load. Filters/sort/page = zero network. Delete = 1
            DELETE + 1 refetch.
          </div>
        </template>
      </MapoList>
    </div>
  </div>
</template>

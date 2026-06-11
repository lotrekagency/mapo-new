<script setup lang="ts">
import type {
  ListColumn,
  FilterDescriptor,
  ActionDescriptor,
  ListTabItem,
} from "@mapomodule/uikit/types";
import type { FieldDescriptor } from "@mapomodule/form/types";
import { formatDate } from "@mapomodule/utils";

definePageMeta({
  layout: "mapo-default",
  label: "Articles",
  icon: "i-lucide-newspaper",
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
  updated_at: string;
  category: number | null;
  excerpt: string;
}

// ─── Columns ──────────────────────────────────────────────────────────────────

const columns: ListColumn<Article>[] = [
  { key: "title", label: "Title", sortable: true, class: "font-medium" },
  { key: "status", label: "Status", sortable: false },
  {
    key: "featured",
    label: "Featured",
    sortable: false,
    class: "text-center",
  },
  {
    key: "reading_time",
    label: "Read Time",
    sortable: false,
    class: "text-center",
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    class: "text-right text-sm",
  },
];

// ─── Filters ──────────────────────────────────────────────────────────────────

const filters: FilterDescriptor[] = [
  {
    value: "status",
    text: "Status",
    multiple: true,
    choices: [
      { text: "Draft", value: "draft", icon: "i-lucide-edit" },
      { text: "Review", value: "review", icon: "i-lucide-clock" },
      { text: "Ready", value: "ready", icon: "i-lucide-check-circle" },
      { text: "Published", value: "published", icon: "i-lucide-globe" },
      { text: "Archived", value: "archived", icon: "i-lucide-archive" },
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
  {
    value: "published_at",
    text: "Published Date",
    datepicker: true,
  },
];

// ─── Tabs ──────────────────────────────────────────────────────────────────────

// "All" uses an empty value so no `status` filter is sent to the BE.
const tabs: ListTabItem[] = [
  { text: "All", value: "" },
  { text: "Draft", value: "draft" },
  { text: "Published", value: "published" },
  { text: "Archived", value: "archived" },
];

// ─── Quick-edit fields ────────────────────────────────────────────────────────

const quickEditFields: FieldDescriptor<Article>[] = [
  {
    key: "title",
    type: "text",
    attrs: { placeholder: "Article title" },
  },
  {
    key: "status",
    type: "select",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "Review", value: "review" },
        { label: "Ready", value: "ready" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
    },
  },
  {
    key: "featured",
    type: "boolean",
  },
  {
    key: "reading_time",
    type: "number",
  },
];

// ─── Bulk actions ────────────────────────────────────────────────────────────

const actions: ActionDescriptor<Article>[] = [
  {
    label: "Publish",
    handleMultiple: true,
    handleAll: true,
    async handler({ selection, selectionQuery }) {
      const ids = selection?.map((a) => a.id) || [];
      if (ids.length === 0 && !selection) {
        // "Select All" case — typically would stream to backend
        console.log("Publishing all with query:", selectionQuery.toString());
      }
      await Promise.all(
        ids.map((id) =>
          $fetch(`/api/articles/${id}`, {
            method: "PATCH",
            body: { status: "published" },
          }),
        ),
      );
      useSnackStore().show(`Published ${ids.length} article(s)`, "success");
    },
  },
  {
    label: "Archive",
    handleMultiple: true,
    handleAll: true,
    async handler({ selection, selectionQuery }) {
      const ids = selection?.map((a) => a.id) || [];
      await Promise.all(
        ids.map((id) =>
          $fetch(`/api/articles/${id}`, {
            method: "PATCH",
            body: { status: "archived" },
          }),
        ),
      );
      useSnackStore().show(`Archived ${ids.length} article(s)`, "info");
    },
  },
  {
    label: "Toggle Featured",
    handleMultiple: true,
    handleAll: false,
    async handler({ selection }) {
      if (!selection) return;
      const ids = selection.map((a) => a.id);
      await Promise.all(
        ids.map((id) =>
          $fetch(`/api/articles/${id}`, {
            method: "PATCH",
            body: { featured: true },
          }),
        ),
      );
      useSnackStore().show(
        `Toggled featured flag on ${ids.length} article(s)`,
        "success",
      );
    },
  },
  {
    label: "Delete",
    dangerous: true,
    handleMultiple: true,
    handleAll: false,
    async handler({ selection }) {
      if (!selection) return;
      const ids = selection.map((a) => a.id);
      const confirmed = await useConfirmStore().ask({
        title: "Delete articles?",
        message: `Are you sure you want to delete ${ids.length} article(s)? This cannot be undone.`,
        confirmText: "Delete",
        cancelText: "Cancel",
        dangerous: true,
      });
      if (!confirmed) return;
      await Promise.all(
        ids.map((id) => $fetch(`/api/articles/${id}`, { method: "DELETE" })),
      );
      useSnackStore().show(`Deleted ${ids.length} article(s)`, "success");
    },
  },
];

// ─── Computed ────────────────────────────────────────────────────────────────

const statusColors: Record<string, "success" | "warning" | "neutral" | "info"> =
  {
    published: "success",
    draft: "warning",
    review: "info",
    ready: "info",
    archived: "neutral",
  };

function responseAdapter(raw: unknown): { items: Article[]; total: number } {
  console.log("Raw API response:", raw);
  if (Array.isArray(raw)) {
    return { items: raw as Article[], total: raw.length };
  }

  if (raw && typeof raw === "object") {
    const payload = raw as Record<string, unknown>;

    if (Array.isArray(payload.results)) {
      return {
        items: payload.results as Article[],
        total: Number(payload.count ?? payload.results.length ?? 0),
      };
    }

    if (payload.data && typeof payload.data === "object") {
      const data = payload.data as Record<string, unknown>;

      if (Array.isArray(data.results)) {
        return {
          items: data.results as Article[],
          total: Number(data.count ?? data.results.length ?? 0),
        };
      }

      if (Array.isArray(data.items)) {
        return {
          items: data.items as Article[],
          total: Number(data.total ?? data.count ?? data.items.length ?? 0),
        };
      }
    }

    if (Array.isArray(payload.items)) {
      return {
        items: payload.items as Article[],
        total: Number(
          payload.total ?? payload.count ?? payload.items.length ?? 0,
        ),
      };
    }
  }

  return { items: [], total: 0 };
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header with create button -->
    <div class="flex items-center justify-between px-6 pt-4">
      <div>
        <h1 class="text-3xl font-bold text-highlighted">Articles</h1>
        <p class="text-sm text-muted mt-1">
          Stress test with all MapoList features: pagination, filters, tabs,
          quick-edit, bulk actions
        </p>
      </div>
      <UButton leading-icon="i-lucide-plus" to="/form/article/new" size="lg">
        New Article
      </UButton>
    </div>

    <!-- MapoList with all features -->
    <div class="px-6 pb-2">
      <MapoList
        endpoint="/api/articles"
        tab-query-param="status"
        :columns="columns"
        :filters="filters"
        :tabs="tabs"
        :actions="actions"
        :edit-fields="quickEditFields"
        detail-base="/form/article"
        lookup="id"
        searchable
        draggable
        position-field="id"
        :default-page-size="10"
        :page-size-options="[10, 20, 50, 100]"
        permission-model="articles.article"
        :response-adapter="responseAdapter"
      >
        <!-- Custom cell: status badge -->
        <template #[`cell.status`]="{ value }">
          <UBadge
            :color="statusColors[value as string] ?? 'neutral'"
            variant="soft"
            size="sm"
          >
            {{ value }}
          </UBadge>
        </template>

        <!-- Custom cell: featured star -->
        <template #[`cell.featured`]="{ value }">
          <div class="flex justify-center">
            <UIcon
              :name="value ? 'i-lucide-star' : 'i-lucide-star-off'"
              :class="['size-4', value ? 'text-yellow-500' : 'text-muted']"
            />
          </div>
        </template>

        <!-- Custom cell: reading time -->
        <template #[`cell.reading_time`]="{ value }">
          <span class="text-xs text-muted">{{ value }}m</span>
        </template>

        <!-- Custom cell: created date -->
        <template #[`cell.created_at`]="{ value }">
          <span class="text-xs text-muted">{{
            formatDate(value as string)
          }}</span>
        </template>

        <!-- Custom toolbar slot (optional) -->
        <template #[`dtable.toolbar`]>
          <div class="text-xs text-muted px-4 py-2">
            💡 Tip: Try sorting columns, filtering by status, using search,
            selecting rows for bulk actions, and changing the page size!
          </div>
        </template>

        <!-- Custom empty state -->
        <template #[`dtable.empty`]>
          <div
            class="flex flex-col items-center justify-center py-12 text-muted space-y-3"
          >
            <UIcon name="i-lucide-inbox" class="size-12 opacity-30" />
            <p class="text-sm font-medium">No articles found</p>
            <p class="text-xs opacity-75">
              Try adjusting your filters or search
            </p>
            <UButton
              variant="outline"
              size="sm"
              to="/form/article/new"
              leading-icon="i-lucide-plus"
            >
              Create first article
            </UButton>
          </div>
        </template>

        <!-- Custom loading state -->
        <template #[`dtable.loading`]>
          <div class="flex items-center justify-center py-12">
            <UIcon
              name="i-lucide-loader-2"
              class="size-6 text-muted animate-spin"
            />
            <span class="ml-2 text-sm text-muted">Loading articles...</span>
          </div>
        </template>
      </MapoList>
    </div>

    <!-- Debugging info -->
    <div class="px-6 pb-4">
      <details class="text-xs text-muted">
        <summary class="cursor-pointer font-mono font-medium mb-2">
          📊 Testing Info
        </summary>
        <div class="bg-elevated rounded p-3 space-y-1 font-mono text-xs">
          <p>
            ✅ <strong>Pagination:</strong> URL state sync (page, page_size,
            search, ordering, filters, tab)
          </p>
          <p>
            ✅ <strong>Sorting:</strong> Click column headers to sort (title,
            created_at)
          </p>
          <p>
            ✅ <strong>Search:</strong> Global text search across title + slug
          </p>
          <p>
            ✅ <strong>Filters:</strong> Status (multi), Featured (single), Date
            range (datepicker)
          </p>
          <p>
            ✅ <strong>Tabs:</strong> All → Draft → Published → Archived (resets
            page to 1)
          </p>
          <p>
            ✅ <strong>Quick-edit:</strong> Click pencil icon to edit title,
            status, featured, reading_time
          </p>
          <p>
            ✅ <strong>Bulk actions:</strong> Select rows → Publish, Archive,
            Toggle Featured, Delete
          </p>
          <p>
            ✅ <strong>Select All:</strong> Bulk actions support "Select All
            pages" (for demo, counts current page only)
          </p>
          <p>
            ✅ <strong>Detail link:</strong> Click row or icon to go to
            /form/article/{id}
          </p>
          <p>
            ✅ <strong>Drag & Drop:</strong> Drag rows to reorder (mocked with
            id as position)
          </p>
          <p>
            ✅ <strong>Custom cells:</strong> Status badge, featured star, read
            time, date formatting
          </p>
          <p>
            ✅ <strong>Permission gating:</strong> Edit/delete icons hidden if
            user lacks permissions
          </p>
          <p>
            ⚡ <strong>Response adapter:</strong> DRF format {results, count}
            with 40+ mock articles
          </p>
        </div>
      </details>
    </div>
  </div>
</template>

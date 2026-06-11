<script setup lang="ts">
/**
 * Articles list — powered by <MapoList>.
 *
 * This page exercises the B1+B2 fixes:
 *
 *  B1 — Filters and sorting:
 *    The status filter (single + multi-select) and is_featured filter now actually
 *    update the list. Before the fix, filter chips appeared but the table never changed.
 *    Sorting columns also works while filters are active (they used to reset each other).
 *
 *  B2 — Endpoint with static query params:
 *    The endpoint is "/api/mock/articles?ordering=-id" — a static default sort.
 *    Quick-edit (detail) and delete still call "/api/mock/articles/<id>/" correctly,
 *    NOT "/api/mock/articles?ordering=-id/<id>/", which was the broken pre-fix behavior.
 */

import type { FieldDescriptor } from "@mapomodule/form/types";
import type {
  FilterDescriptor,
  ActionDescriptor,
  ListColumn,
  ListTabItem,
} from "mapomodule/types";

definePageMeta({
  label: "Articles",
  icon: "i-lucide-newspaper",
  layout: "mapo-default",
  middleware: ["auth"],
});

interface Article {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  published_at: string | null;
  priority: number;
  translations: Record<string, { title?: string; body?: string }>;
  /** Sentinel key for the custom row-actions column (no model field). */
  actions?: never;
}

// ─── Columns ──────────────────────────────────────────────────────────────────
const columns: ListColumn<Article>[] = [
  {
    key: "id",
    label: "ID",
    sortable: false,
    class: "w-14 font-mono text-xs text-muted",
  },
  { key: "title", label: "Title", sortable: true },
  { key: "status", label: "Status", sortable: true },
  {
    key: "is_featured",
    label: "Featured",
    sortable: false,
    class: "w-24 text-center",
  },
  { key: "published_at", label: "Published", sortable: true },
  {
    key: "priority",
    label: "Priority",
    sortable: true,
    class: "w-20 text-center",
  },
  // Sentinel column for row actions (I1: row actions pattern).
  // No API prop — use #cell.actions slot with custom buttons.
  { key: "actions", label: "", class: "w-20" },
];

// ─── Filters ──────────────────────────────────────────────────────────────────
// B1 fix test: both filters must actually update the table.
// Before the fix they showed chips but the list never changed.
// `status` is multi-select → sends status=a&status=b; `is_featured` is exclusive.
const filters: FilterDescriptor[] = [
  {
    value: "status",
    text: "Status",
    multiple: true,
    choices: [
      { text: "Published", value: "published", icon: "i-lucide-circle-check" },
      { text: "Draft", value: "draft", icon: "i-lucide-pencil" },
      { text: "Archived", value: "archived", icon: "i-lucide-archive" },
    ],
  },
  {
    value: "is_featured",
    text: "Featured",
    choices: [
      { text: "Featured only", value: "true", icon: "i-lucide-star" },
      { text: "Not featured", value: "false", icon: "i-lucide-star-off" },
    ],
  },
];

// ─── Tabs ─────────────────────────────────────────────────────────────────────
// Tabs switch a query param on the endpoint URL.
// MapoList re-fetches automatically when the active tab changes.
// In v1 you'd manage tab state in data(), watch it, and re-trigger the fetch manually.
const tabs: ListTabItem[] = [
  { text: "All", value: "" },
  { text: "Published", value: "published" },
  { text: "Drafts", value: "draft" },
  { text: "Archived", value: "archived" },
];

// ─── Bulk actions ─────────────────────────────────────────────────────────────
// In v1: a custom <v-select> wired to a Vuex action, a hand-rolled confirm dialog,
// and error handling scattered across multiple methods.
// Here: a descriptor with a handler. MapoList shows the confirm dialog, runs the
// handler, shows snack feedback, and refreshes the table — you own only the logic.
const actions: ActionDescriptor<Article>[] = [
  {
    label: "Mark as published",
    permissions: "change_article",
    handleMultiple: true,
    handler: async ({ selection }) => {
      if (!selection) return;
      await Promise.all(
        selection.map((a) =>
          $fetch(`/api/mock/articles/${a.id}`, {
            method: "PATCH",
            body: { status: "published" },
          }),
        ),
      );
    },
  },
  {
    label: "Mark as draft",
    permissions: "change_article",
    handleMultiple: true,
    handler: async ({ selection }) => {
      if (!selection) return;
      await Promise.all(
        selection.map((a) =>
          $fetch(`/api/mock/articles/${a.id}`, {
            method: "PATCH",
            body: { status: "draft" },
          }),
        ),
      );
    },
  },
];

// ─── Quick-edit fields ────────────────────────────────────────────────────────
// These fields appear in the inline modal when clicking the pencil icon on a row.
// In v1 you'd build a full ListQuickEdit.vue with a hand-rolled v-dialog + v-form.
// Here: the same FieldDescriptor syntax you already know from MapoDetail.
const quickEditFields: FieldDescriptor<Article>[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Published", value: "published" },
        { label: "Draft", value: "draft" },
        { label: "Archived", value: "archived" },
      ],
    },
  },
  {
    key: "is_featured",
    type: "switch",
    label: "Featured",
  },
  {
    key: "priority",
    type: "number",
    label: "Priority",
    attrs: { min: 1, max: 100 },
  },
  {
    key: "published_at",
    type: "datetime",
    label: "Publication date",
  },
];

// (listRef kept for external refresh, e.g. after a side action)
const listRef = ref<{ refresh: () => void } | null>(null);
</script>

<template>
  <!--
    <MapoList> is the single entry point for any list page in Mapo v2.

    What it replaces from v1:
      ✅ ListTable.vue     — server-side UTable with TanStack (was Vuetify v-data-table)
      ✅ ListFilters.vue   — filter chips + dropdown (was a hand-rolled v-navigation-drawer)
      ✅ ListActions.vue   — bulk action bar (was a custom v-select + Vuex dispatch)
      ✅ ListQuickEdit.vue — inline edit modal (was a full custom dialog per page)
      ✅ ListTabs.vue      — tab navigation with counts (was manual tab state + watchers)

    The props mirror the v1 component contracts where possible, so migration is
    mostly a find-and-replace of descriptor format, not a logic rewrite.

    Slots let you override any part:
      #head              → above the table (page title, "New" button, custom toolbar)
      #dtable.toolbar    → extra controls next to the search input
      #dtable.empty      → custom empty state
      #filter.{value}    → custom filter UI for a specific filter key
  -->
  <div class="p-6">
    <!--
      B2 test: endpoint has a static ?ordering=-id query param.
      B3 test: defaultPageSize + pageSizeOptions are customizable.
             For offset/limit backends use:
               :pagination-params="({ page, pageSize }) => ({ offset: (page - 1) * pageSize, limit: pageSize })"
             For non-DRF response shapes use:
               :response-adapter="(raw) => ({ items: raw.data, total: raw.meta.total })"
    -->
    <MapoList
      ref="listRef"
      endpoint="/api/mock/articles?ordering=-id"
      detail-base="/articles"
      :columns="columns"
      :filters="filters"
      :tabs="tabs"
      tab-query-param="status"
      :actions="actions"
      :edit-fields="quickEditFields"
      lookup="id"
      :searchable="true"
      :default-page-size="5"
      :page-size-options="[5, 10, 25, 50]"
    >
      <!-- #head: page title + create button -->
      <template #head>
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-semibold">Articles</h1>
          <UButton icon="i-lucide-plus" to="/articles/new" size="sm">
            New article
          </UButton>
        </div>
      </template>

      <!-- B1 test: custom cell for is_featured — rendered only when filter is active -->
      <template #cell.is_featured="{ value }">
        <UIcon
          v-if="value"
          name="i-lucide-star"
          class="h-4 w-4 text-yellow-500"
        />
        <UIcon v-else name="i-lucide-star-off" class="h-4 w-4 text-muted" />
      </template>

      <!-- Custom status badge -->
      <template #cell.status="{ value }">
        <UBadge
          :color="
            value === 'published'
              ? 'success'
              : value === 'draft'
                ? 'warning'
                : 'neutral'
          "
          variant="subtle"
          size="sm"
        >
          {{ value }}
        </UBadge>
      </template>

      <!-- Row actions — I1: sentinel column + #cell.actions slot pattern -->
      <template #cell.actions="{ item }">
        <div class="flex justify-end gap-1">
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-pencil"
            :to="`/articles/${item.id}`"
          />
        </div>
      </template>
    </MapoList>
  </div>
</template>

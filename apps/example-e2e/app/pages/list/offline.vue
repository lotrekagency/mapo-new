<script setup lang="ts">
// ─────────────────────────────────────────────────────────────────────────────
// MapoList — OFFLINE mode example
//
// Passing `v-model:items` (and no `endpoint`) puts MapoList in offline mode:
// the component never calls the backend. Everything — search, filters, tabs,
// multi-column sort, pagination, drag-reorder, row delete, quick-edit save —
// runs in memory on the local array. Each mutation emits `update:items`, so
// `tasks` below is the single source of truth and stays in sync with the UI.
//
// Open DevTools → Network: you will see zero requests when interacting with
// the table. The "live array state" panel at the bottom reflects every change.
// ─────────────────────────────────────────────────────────────────────────────
import { ref } from "vue";
import type {
  ListColumn,
  FilterDescriptor,
  ListTabItem,
  ActionDescriptor,
} from "@mapomodule/uikit/types";
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "List — Offline",
  icon: "i-lucide-database-zap",
  middleware: ["auth"],
});

interface Task {
  id: number;
  title: string;
  assignee: string;
  status: "todo" | "doing" | "done" | "archived";
  priority: "low" | "medium" | "high";
  estimate: number;
  created_at: string;
}

// In-memory dataset — bound via `v-model:items`. Drag, delete and quick-edit
// each emit `update:items` and rewrite this ref. There is no backend mock.
const tasks = ref<Task[]>([
  {
    id: 1,
    title: "Refactor list table",
    assignee: "Anna",
    status: "doing",
    priority: "high",
    estimate: 5,
    created_at: "2026-04-10",
  },
  {
    id: 2,
    title: "Write offline mode docs",
    assignee: "Bruno",
    status: "todo",
    priority: "medium",
    estimate: 2,
    created_at: "2026-04-12",
  },
  {
    id: 3,
    title: "Add language switch slot",
    assignee: "Carla",
    status: "done",
    priority: "low",
    estimate: 1,
    created_at: "2026-04-08",
  },
  {
    id: 4,
    title: "Migrate auth middleware",
    assignee: "Davide",
    status: "done",
    priority: "high",
    estimate: 8,
    created_at: "2026-04-01",
  },
  {
    id: 5,
    title: "Topbar dropdown polish",
    assignee: "Anna",
    status: "archived",
    priority: "low",
    estimate: 1,
    created_at: "2026-03-22",
  },
  {
    id: 6,
    title: "Sidebar drag reorder",
    assignee: "Bruno",
    status: "todo",
    priority: "high",
    estimate: 5,
    created_at: "2026-04-15",
  },
  {
    id: 7,
    title: "Quick-edit i18n",
    assignee: "Carla",
    status: "doing",
    priority: "medium",
    estimate: 3,
    created_at: "2026-04-18",
  },
  {
    id: 8,
    title: "Move CRUD types to core",
    assignee: "Davide",
    status: "done",
    priority: "medium",
    estimate: 2,
    created_at: "2026-04-05",
  },
  {
    id: 9,
    title: "MediaManager skeleton",
    assignee: "Anna",
    status: "todo",
    priority: "high",
    estimate: 8,
    created_at: "2026-04-19",
  },
  {
    id: 10,
    title: "Confirm dialog focus trap",
    assignee: "Bruno",
    status: "doing",
    priority: "low",
    estimate: 1,
    created_at: "2026-04-11",
  },
  {
    id: 11,
    title: "Snackbar queue",
    assignee: "Carla",
    status: "done",
    priority: "low",
    estimate: 1,
    created_at: "2026-04-03",
  },
  {
    id: 12,
    title: "Permissions composable",
    assignee: "Davide",
    status: "done",
    priority: "medium",
    estimate: 3,
    created_at: "2026-04-07",
  },
  {
    id: 13,
    title: "Route meta linter",
    assignee: "Anna",
    status: "archived",
    priority: "low",
    estimate: 2,
    created_at: "2026-03-15",
  },
  {
    id: 14,
    title: "Drag handle keyboard a11y",
    assignee: "Bruno",
    status: "todo",
    priority: "medium",
    estimate: 3,
    created_at: "2026-04-20",
  },
  {
    id: 15,
    title: "Date picker filter range",
    assignee: "Carla",
    status: "doing",
    priority: "high",
    estimate: 5,
    created_at: "2026-04-16",
  },
]);

const columns: ListColumn<Task>[] = [
  { key: "title", label: "Title", sortable: true, class: "font-medium" },
  { key: "assignee", label: "Assignee", sortable: true },
  { key: "status", label: "Status", sortable: false },
  { key: "priority", label: "Priority", sortable: true, class: "text-center" },
  { key: "estimate", label: "Est.", sortable: true, class: "text-right" },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    class: "text-right text-sm",
  },
];

const filters: FilterDescriptor[] = [
  {
    value: "priority",
    text: "Priority",
    multiple: true,
    choices: [
      { text: "Low", value: "low" },
      { text: "Medium", value: "medium" },
      { text: "High", value: "high" },
    ],
  },
  {
    value: "assignee",
    text: "Assignee",
    multiple: true,
    choices: [
      { text: "Anna", value: "Anna" },
      { text: "Bruno", value: "Bruno" },
      { text: "Carla", value: "Carla" },
      { text: "Davide", value: "Davide" },
    ],
  },
];

// Tabs are wired to `tab-query-param="status"` below — so the active tab
// writes `?status=…` and applyOffline filters tasks by their `status` field
// using plain equality. The "All" tab uses an empty string so no filter applies.
const tabs: ListTabItem[] = [
  { text: "All", value: "" },
  { text: "Todo", value: "todo" },
  { text: "Doing", value: "doing" },
  { text: "Done", value: "done" },
  { text: "Archived", value: "archived" },
];

// Quick-edit in offline mode: MapoListQuickEdit seeds its form from the
// matching row in `tasks`, skips `crud.detail()` and `crud.partialUpdate()`,
// and on save emits the edited model — the list splices it back and emits
// `update:items`, keeping `tasks` in sync.
const quickEditFields: FieldDescriptor<Task>[] = [
  { key: "title", type: "text" },
  { key: "estimate", type: "number" },
];

// Bulk actions in offline mode: handlers receive the selected rows and just
// mutate the local array directly. No CRUD calls involved.
const actions: ActionDescriptor<Task>[] = [
  {
    label: "Mark done",
    handleMultiple: true,
    handleAll: false,
    async handler({ selection }) {
      if (!selection) return;
      const ids = new Set(selection.map((t) => t.id));
      tasks.value = tasks.value.map((t) =>
        ids.has(t.id) ? { ...t, status: "done" } : t,
      );
      useSnackStore().show(`Marked ${ids.size} task(s) done`, "success");
    },
  },
];

const statusColors: Record<
  Task["status"],
  "success" | "warning" | "info" | "neutral"
> = {
  todo: "warning",
  doing: "info",
  done: "success",
  archived: "neutral",
};

const priorityColors: Record<
  Task["priority"],
  "error" | "warning" | "neutral"
> = {
  high: "error",
  medium: "warning",
  low: "neutral",
};
</script>

<template>
  <div class="space-y-4">
    <div class="px-6 pt-4">
      <h1 class="text-3xl font-bold text-highlighted">List — Offline mode</h1>
      <p class="text-sm text-muted mt-1">
        No backend. <code>v-model:items</code> drives a local array — search,
        filters, tabs, sort, pagination, drag-reorder and delete all happen in
        memory.
      </p>
    </div>

    <div class="px-6 pb-2">
      <!--
        v-model:items="tasks"   → activates offline mode; every mutation rewrites `tasks`.
        tab-query-param="status" → tab value is matched against the `status` field.
        draggable                → drag reorder rewrites `tasks` in place (cross-page safe).
      -->
      <MapoList
        v-model:items="tasks"
        :columns="columns"
        :filters="filters"
        :tabs="tabs"
        :actions="actions"
        :edit-fields="quickEditFields"
        tab-query-param="status"
        lookup="id"
        searchable
        draggable
        :default-page-size="5"
        :page-size-options="[5, 10, 20]"
      >
        <template #[`cell.status`]="{ value }">
          <UBadge
            :color="statusColors[value as Task['status']]"
            variant="soft"
            size="sm"
          >
            {{ value }}
          </UBadge>
        </template>

        <template #[`cell.priority`]="{ value }">
          <UBadge
            :color="priorityColors[value as Task['priority']]"
            variant="outline"
            size="sm"
          >
            {{ value }}
          </UBadge>
        </template>

        <template #[`cell.estimate`]="{ value }">
          <span class="text-xs text-muted">{{ value }}h</span>
        </template>

        <template #[`dtable.toolbar`]>
          <div class="text-xs text-muted px-2">
            💡 All operations run client-side — open DevTools network, you'll
            see zero requests.
          </div>
        </template>
      </MapoList>
    </div>

    <div class="px-6 pb-4">
      <details class="text-xs text-muted">
        <summary class="cursor-pointer font-mono font-medium mb-2">
          📊 Live array state ({{ tasks.length }} items)
        </summary>
        <pre
          class="bg-elevated rounded p-3 overflow-auto max-h-64 text-[10px]"
          >{{ tasks }}</pre
        >
      </details>
    </div>
  </div>
</template>

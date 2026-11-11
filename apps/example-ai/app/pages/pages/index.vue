<script setup lang="ts">
// The pages of the app's small backend (server/api/pages): landing pages
// made of blocks. Open one, or a new one, to fill its blocks with Magic
// Fill, which the module adds to every detail page of an app with mapo.ai.
import type { ListColumn } from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  label: "Pages",
  icon: "i-lucide-layout-template",
  sidebarOrder: 4,
  middleware: ["auth"],
});

interface Page {
  id: number;
  title: string;
  status: string;
}

const columns: ListColumn<Page>[] = [
  { key: "title", label: "Title", class: "font-medium" },
  { key: "status", label: "Status" },
];
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <div class="flex justify-end">
      <UButton to="/pages/new" icon="i-lucide-plus" label="New page" />
    </div>
    <MapoList
      endpoint="/api/pages"
      :columns="columns"
      detail-base="/pages"
      permission-model="page"
    />
  </div>
</template>

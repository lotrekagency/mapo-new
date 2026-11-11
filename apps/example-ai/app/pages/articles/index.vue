<script setup lang="ts">
// The articles of the app's small backend (server/api/articles): open one,
// or a new one, to fill it with Magic Fill, which the module adds to every
// detail page of an app with mapo.ai.
import type { ListColumn } from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  label: "Articles",
  icon: "i-lucide-newspaper",
  sidebarOrder: 3,
  middleware: ["auth"],
});

interface Article {
  id: number;
  title: string;
  status: string;
  published_on: string | null;
}

const columns: ListColumn<Article>[] = [
  { key: "title", label: "Title", class: "font-medium" },
  { key: "status", label: "Status" },
  { key: "published_on", label: "Published on" },
];
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <div class="flex justify-end">
      <UButton to="/articles/new" icon="i-lucide-plus" label="New article" />
    </div>
    <MapoList
      endpoint="/api/articles"
      :columns="columns"
      detail-base="/articles"
      permission-model="article"
    />
  </div>
</template>

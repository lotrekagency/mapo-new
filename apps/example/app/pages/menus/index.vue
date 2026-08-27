<script setup lang="ts">
import type { ListColumn } from "@mapomodule/uikit/types";

definePageMeta({
  layout: "mapo-default",
  label: "Menu",
  icon: "i-lucide-network",
  middleware: ["auth"],
});

interface MenuRow {
  id: number;
  key: string;
  enabled: boolean;
}

const columns: ListColumn<MenuRow>[] = [
  { key: "key", label: "Key" },
  { key: "enabled", label: "Enabled" },
];
</script>

<template>
  <div class="p-6">
    <MapoList
      endpoint="/api/mock/menus"
      detail-base="/menus"
      :columns="columns"
      searchable
    />
  </div>
</template>

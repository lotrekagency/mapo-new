<script setup lang="ts">
/**
 * Menu list — entry point for the Menu Manager scenarios.
 *
 * Each row links to `/menu/<id>`, the full manager. The three seeded menus
 * cover the shapes the manager has to handle:
 *   - `navbar` (id 1)        — translatable, 3 levels deep
 *   - `footer` (id 2)        — translatable, one empty language
 *   - `sidebar-links` (id 3) — NOT translatable (flat `nodes` array)
 */
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
  <div class="space-y-4 p-6">
    <div>
      <h1 class="text-2xl font-bold">Menu</h1>
      <p class="mt-1 text-sm text-gray-500">
        Apri un menu per l'editor completo. Le altre scenario page sono nella
        sidebar sotto "Menu".
      </p>
    </div>

    <MapoList
      endpoint="/api/menus"
      detail-base="/menu"
      :columns="columns"
      searchable
    />
  </div>
</template>

<script setup lang="ts">
// The events of the app's small backend (server/api/events): open one, or
// a new one, to fill it with Magic Fill, or import several from a
// programme (/events/import), which finds every event a source describes.
import type { ListColumn } from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  label: "Events",
  icon: "i-lucide-calendar-days",
  sidebarOrder: 5,
  middleware: ["auth"],
});

interface CityEvent {
  id: number;
  title: string;
  starts_on: string | null;
  status: string;
}

const columns: ListColumn<CityEvent>[] = [
  { key: "title", label: "Title", class: "font-medium" },
  { key: "starts_on", label: "Date" },
  { key: "status", label: "Status" },
];
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <div class="flex justify-end gap-2">
      <UButton
        to="/events/import"
        icon="i-lucide-file-input"
        color="neutral"
        variant="outline"
        label="Import events"
      />
      <UButton to="/events/new" icon="i-lucide-plus" label="New event" />
    </div>
    <MapoList
      endpoint="/api/events"
      :columns="columns"
      detail-base="/events"
      permission-model="event"
    />
  </div>
</template>

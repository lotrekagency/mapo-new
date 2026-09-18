<script setup lang="ts">
/**
 * Placeholder rendered by the media fields when the Media Manager is not
 * registered — i.e. `@mapomodule/form` is installed without `@mapomodule/uikit`.
 * Better than a silently broken picker: it names the missing package.
 */
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-lg border border-dashed border-default px-3 py-2 text-xs text-muted"
  >
    <UIcon
      name="i-lucide-triangle-alert"
      class="size-4 shrink-0 text-warning"
    />
    <span>Media fields require <code>@mapomodule/uikit</code>.</span>
  </div>
</template>

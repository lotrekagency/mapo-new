<script setup lang="ts">
defineSlots<{
  /** Main content of the list header (page title, breadcrumbs, action buttons). */
  head(): any;
}>();
</script>

<template>
  <div class="mapo-list-head mb-4">
    <slot name="head" />
  </div>
</template>

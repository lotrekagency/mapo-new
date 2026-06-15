<script setup lang="ts">
// Tests: meta.parent nesting — this child appears under "Sidebar Nesting" in the sidebar.
// When this page is active, the parent item should be expanded and highlighted.
// E2E plan: e2e/uikit/sidebar.md §3.1–3.3
definePageMeta({
  layout: "mapo-default",
  label: "Child A",
  icon: "i-lucide-file",
  parent: "sidebar-parent", // links this route under the parent in the sidebar tree
  middleware: ["auth"],
});
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">Child A</h1>
    <p class="text-muted text-sm mb-6">
      This page has
      <code class="bg-elevated px-1 rounded">parent: 'sidebar-parent'</code>. It
      should appear nested under "Sidebar Nesting" in the sidebar.
    </p>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >What to verify</span
        >
      </template>
      <ul class="space-y-2 text-sm text-muted list-disc list-inside">
        <li>"Child A" is indented under "Sidebar Nesting" in the sidebar</li>
        <li>"Child A" is highlighted as the active item</li>
        <li>
          "Sidebar Nesting" (parent) is expanded and partially highlighted
        </li>
      </ul>

      <div class="mt-4">
        <NuxtLink to="/sidebar-parent">
          <UButton variant="ghost" size="sm" leading-icon="i-lucide-arrow-left">
            Back to parent
          </UButton>
        </NuxtLink>
      </div>
    </UCard>
  </UContainer>
</template>

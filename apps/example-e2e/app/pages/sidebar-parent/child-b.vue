<script setup lang="ts">
// Tests: second child under the same parent — verifies multiple children render correctly.
// Also tests that only Child B is highlighted (not Child A) when navigating here.
// E2E plan: e2e/uikit/sidebar.md §3.1–3.4
definePageMeta({
  layout: "mapo-default",
  label: "Child B",
  icon: "i-lucide-file-text",
  parent: "sidebar-parent",
  middleware: ["auth"],
});
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">Child B</h1>
    <p class="text-muted text-sm mb-6">
      Second child of "Sidebar Nesting". Only this item should be highlighted;
      Child A should not be.
    </p>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >What to verify</span
        >
      </template>
      <ul class="space-y-2 text-sm text-muted list-disc list-inside">
        <li>"Child B" is highlighted as active</li>
        <li>"Child A" is NOT highlighted</li>
        <li>Parent "Sidebar Nesting" is still expanded</li>
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

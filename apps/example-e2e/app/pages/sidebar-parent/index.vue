<script setup lang="ts">
// Tests: meta.parent nesting — this page acts as the parent item in the sidebar.
// Child pages declared with meta.parent = 'sidebar-parent' appear beneath it.
// Clicking the parent should expand the submenu; active child highlights the parent too.
// E2E plan: e2e/uikit/sidebar.md §3
definePageMeta({
  layout: "mapo-default",
  label: "Sidebar Nesting",
  icon: "i-lucide-git-branch",
  middleware: ["auth"],
});
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Sidebar Nesting — Parent
    </h1>
    <p class="text-muted text-sm mb-6">
      E2E plan: <code>e2e/uikit/sidebar.md §3</code> — nested menu items.
    </p>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >What to verify in the sidebar</span
        >
      </template>
      <ul class="space-y-2 text-sm text-muted list-disc list-inside">
        <li>
          "Sidebar Nesting" is a top-level item with a caret/expand indicator
        </li>
        <li>Clicking it expands to show "Child A" and "Child B" beneath it</li>
        <li>
          This page (/sidebar-parent) is the parent; children live under it
        </li>
        <li>
          When navigating to a child, the parent item stays expanded and
          highlighted
        </li>
      </ul>

      <div class="mt-4 flex gap-2">
        <NuxtLink to="/sidebar-parent/child-a">
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            leading-icon="i-lucide-arrow-right"
          >
            Go to Child A
          </UButton>
        </NuxtLink>
        <NuxtLink to="/sidebar-parent/child-b">
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            leading-icon="i-lucide-arrow-right"
          >
            Go to Child B
          </UButton>
        </NuxtLink>
      </div>
    </UCard>
  </UContainer>
</template>

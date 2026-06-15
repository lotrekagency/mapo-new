<script setup lang="ts">
// Tests: sidebar §1.2 — a route WITHOUT meta.label must NOT appear in the sidebar.
// This page has no label; it is only reachable by direct URL (/hidden-from-nav).
// The tester should verify it is absent from the sidebar nav list.
// E2E plan: e2e/uikit/sidebar.md §1.2
definePageMeta({
  layout: "mapo-default",
  // No label — intentionally omitted so this route does not appear in the sidebar.
  middleware: ["auth"],
});
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Hidden from Navigation
    </h1>
    <p class="text-muted text-sm mb-6">
      This page has
      <strong
        >no <code class="bg-elevated px-1 rounded">meta.label</code></strong
      >. It is reachable by direct URL but must not appear in the sidebar nav
      list.
    </p>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >What to verify</span
        >
      </template>
      <ul class="space-y-2 text-sm text-muted list-disc list-inside">
        <li>This page does NOT appear in the sidebar at all</li>
        <li>The sidebar shows all other labeled pages, but not this one</li>
        <li>Navigating back via browser history still works normally</li>
      </ul>
      <div class="mt-4">
        <NuxtLink to="/">
          <UButton variant="ghost" size="sm" leading-icon="i-lucide-arrow-left">
            Back to Home
          </UButton>
        </NuxtLink>
      </div>
    </UCard>
  </UContainer>
</template>

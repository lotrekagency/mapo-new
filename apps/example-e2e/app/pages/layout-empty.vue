<script setup lang="ts">
// Tests: mapo-empty layout — no sidebar, no topbar, only the default slot content.
// Used for login, error pages, and standalone views that don't need the admin shell.
// E2E plan: e2e/uikit/layout.md §1.2
definePageMeta({
  layout: "mapo-empty",
  // No label — this page intentionally has no sidebar/topbar, so it doesn't appear in nav.
});
</script>

<template>
  <!-- Tests layout §1.2: only default slot, no sidebar or topbar -->
  <div class="min-h-screen flex items-center justify-center bg-default p-8">
    <div class="max-w-md w-full space-y-4">
      <div class="text-center">
        <div
          class="size-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"
        >
          <UIcon name="i-lucide-layout" class="size-6 text-primary" />
        </div>
        <h1 class="text-2xl font-bold text-highlighted">mapo-empty layout</h1>
        <p class="text-muted text-sm mt-2">
          This page uses
          <code class="bg-elevated px-1 rounded">layout: 'mapo-empty'</code>.
          There should be no sidebar and no topbar — just this content.
        </p>
      </div>

      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >What to verify</span
          >
        </template>
        <ul class="space-y-2 text-sm text-muted list-disc list-inside">
          <li>No sidebar on the left</li>
          <li>No topbar at the top</li>
          <li>Full viewport available for content</li>
          <li>Navigating back restores the admin shell</li>
        </ul>
      </UCard>

      <div class="text-center">
        <NuxtLink to="/layout-slots">
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-arrow-left"
          >
            Back to Layout page
          </UButton>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

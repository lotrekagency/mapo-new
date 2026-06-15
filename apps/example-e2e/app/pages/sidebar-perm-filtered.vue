<script setup lang="ts">
// Tests: sidebar §4.1–4.2 — a route with meta.permissions is hidden from the sidebar
// for users who lack the required permission. The item is visible only when the user
// has delete_article (admin only in this mock setup).
// editor has add/change/view but NOT delete — should NOT see this in sidebar.
// viewer has only view_article — should NOT see this in sidebar.
// admin is_superuser — bypasses all permission checks, sees everything.
// E2E plan: e2e/uikit/sidebar.md §4.1–4.3
definePageMeta({
  layout: "mapo-default",
  label: "Admin-only Item",
  icon: "i-lucide-shield",
  middleware: ["auth", "permissions"],
  permissions: ["delete_article"], // only admin has this — sidebar hides it for editor/viewer
});
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Sidebar Permission Filtering
    </h1>
    <p class="text-muted text-sm mb-6">
      This page requires
      <code class="bg-elevated px-1 rounded">delete_article</code>. Only
      <strong>admin</strong> has this permission in the mock setup.
    </p>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Expected sidebar behaviour</span
        >
      </template>
      <ul class="space-y-2 text-sm text-muted list-disc list-inside">
        <li>
          <strong>admin/admin</strong> — "Admin-only Item" IS visible in the
          sidebar
        </li>
        <li>
          <strong>editor/editor</strong> — "Admin-only Item" is hidden from the
          sidebar
        </li>
        <li>
          <strong>viewer/viewer</strong> — "Admin-only Item" is hidden from the
          sidebar
        </li>
      </ul>
    </UCard>
  </UContainer>
</template>

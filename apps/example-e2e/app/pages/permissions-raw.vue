<script setup lang="ts">
// Tests: middleware 'permissions' with raw string[] format.
// Checks that 'view_article' codename is present in the user's all_permissions.
// Raw format does NOT populate pagePermissions — only gates the route.
// viewer/editor/admin can all enter; a user without view_article would be blocked.
// E2E plan: e2e/modules/core-middleware.md §2.1–2.2, §2.5
import { useAuthStore, useRoute, usePermissions, computed } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Permissions (raw)",
  icon: "i-lucide-list-checks",
  middleware: ["auth", "permissions"],
  permissions: ["view_article"], // raw codename array — no pagePermissions populated
});

const auth = useAuthStore();
const route = useRoute();
const { checkPermission } = usePermissions();
// pagePermissions should be empty for raw string[] format.
const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Permissions — raw string[] format
    </h1>
    <p class="text-muted text-sm mb-6">
      This page uses
      <code class="bg-elevated px-1 rounded">permissions: ['view_article']</code
      >. It only gates the route. <code>pagePermissions</code> is
      <em>not</em> populated (raw format).
    </p>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key" class="size-4 text-primary" />
          <span class="font-medium text-sm"
            >pagePermissions for this route (should be empty)</span
          >
        </div>
      </template>

      <div class="flex items-center gap-2">
        <UBadge
          :color="pagePerms.length === 0 ? 'success' : 'error'"
          variant="subtle"
          size="sm"
        >
          {{
            pagePerms.length === 0
              ? "Empty ✓ (correct for raw format)"
              : "Unexpectedly populated!"
          }}
        </UBadge>
      </div>

      <USeparator class="my-4" />

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Logged in as</dt>
        <dd>{{ auth.username }}</dd>
        <dt class="text-muted">has view_article</dt>
        <dd>
          <UBadge
            :color="checkPermission('view_article') ? 'success' : 'error'"
            variant="subtle"
            size="xs"
          >
            {{ checkPermission("view_article") }}
          </UBadge>
        </dd>
      </dl>
    </UCard>
  </UContainer>
</template>

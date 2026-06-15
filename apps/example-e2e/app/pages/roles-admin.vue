<script setup lang="ts">
// Tests: middleware 'roles' with meta.roles = ['admin'].
// Only users in the 'admin' group (or is_superuser) can enter this page.
// admin/admin passes (superuser). editor/editor is blocked (group: editors).
// viewer/viewer is blocked (no groups).
// E2E plan: e2e/modules/core-middleware.md §3.1–3.2
import { useAuthStore } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Roles (admin only)",
  icon: "i-lucide-crown",
  middleware: ["auth", "roles"],
  roles: ["admin"], // only admin group or superuser
});

const auth = useAuthStore();
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Roles — admin group only
    </h1>
    <p class="text-muted text-sm mb-6">
      This page uses
      <code class="bg-elevated px-1 rounded">roles: ['admin']</code>. Only users
      in the <strong>admin</strong> group or superusers can enter. Logging in as
      <code>editor</code> or <code>viewer</code> should trigger a 403 error.
    </p>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-crown" class="size-4 text-primary" />
          <span class="font-medium text-sm">You are in</span>
        </div>
      </template>

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Username</dt>
        <dd>{{ auth.username }}</dd>
        <dt class="text-muted">Groups</dt>
        <dd>{{ auth.info?.groups?.join(", ") || "—" }}</dd>
        <dt class="text-muted">is_superuser</dt>
        <dd>
          <UBadge
            :color="auth.info?.is_superuser ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ auth.info?.is_superuser ?? false }}
          </UBadge>
        </dd>
      </dl>

      <div
        class="mt-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
      >
        <UIcon name="i-lucide-check-circle" class="size-4 inline mr-1" />
        Access granted — you meet the role requirement.
      </div>
    </UCard>
  </UContainer>
</template>

<script setup lang="ts">
// Tests: middleware 'permissions' with { model: 'article' } format.
// Derives CRUD codenames (view_article, add_article, change_article, delete_article).
// Checks view_article — viewer/editor/admin pass, a user without any perm would be blocked.
// pagePermissions[routeName] is populated with { view, add, change, delete } booleans.
// E2E plan: e2e/modules/core-middleware.md §2.3–2.4
import { useAuthStore, useRoute } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Permissions (model)",
  icon: "i-lucide-database-zap",
  middleware: ["auth", "permissions"],
  permissions: { model: "article" },
});

const auth = useAuthStore();
const route = useRoute();
const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Permissions — model format
    </h1>
    <p class="text-muted text-sm mb-6">
      This page uses
      <code class="bg-elevated px-1 rounded"
        >permissions: &#123; model: 'article' &#125;</code
      >. It derives <code>view_article</code> for gate check and populates
      <code>pagePermissions[routeName]</code> with CRUD booleans.
    </p>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key" class="size-4 text-primary" />
          <span class="font-medium text-sm"
            >pagePermissions for this route</span
          >
        </div>
      </template>

      <p v-if="!pagePerms.length" class="text-xs text-muted">
        No pagePermissions set.
      </p>
      <div v-else class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="action in pagePerms"
          :key="action"
          variant="subtle"
          color="primary"
          size="xs"
        >
          {{ action }}
        </UBadge>
      </div>

      <USeparator class="my-4" />

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Logged in as</dt>
        <dd>{{ auth.username }}</dd>
        <dt class="text-muted">is_superuser</dt>
        <dd>{{ auth.info?.is_superuser }}</dd>
      </dl>
    </UCard>

    <p class="text-xs text-muted mt-4">
      Try logging in as
      <code class="bg-elevated px-1 rounded">viewer/viewer</code> (view only) or
      <code class="bg-elevated px-1 rounded">editor/editor</code> (add +
      change). All three accounts have <code>view_article</code> so they can
      enter this page.
    </p>
  </UContainer>
</template>

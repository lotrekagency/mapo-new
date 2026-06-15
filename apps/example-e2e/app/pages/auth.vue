<script setup lang="ts">
// Tests: useAuthStore state after login — user, permissions, isAuthenticated.
// hasPermission() with a known codename. pagePermissions populated via { model }.
// SSR hydration: hard refresh should show user data without a flash.
// E2E plan: e2e/modules/core-auth.md, e2e/modules/store.md §1
import { useAuthStore, useRoute, usePermissions, computed } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Auth Store",
  icon: "i-lucide-user-check",
  middleware: ["auth", "permissions"],
  permissions: { model: "article" }, // populates pagePermissions[routeName]
});

const auth = useAuthStore();
const route = useRoute();
const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
const { checkPermission } = usePermissions();
// Tests hasPermission() with both a known and an unknown codename.
const knownPerm = "view_article";
const unknownPerm = "delete_user";
</script>

<template>
  <UContainer class="py-8 max-w-2xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">Auth Store</h1>
    <p class="text-muted text-sm mb-6">
      E2E plan: <code>e2e/modules/core-auth.md</code> — user info, permissions,
      pagePermissions.
    </p>

    <div class="grid gap-4">
      <!-- Tests 1.1–1.3, store §1.1: user object and isAuthenticated -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-user" class="size-4 text-muted" />
            <span class="font-medium text-sm">User Info</span>
            <!-- Tests 5.2: isAuthenticated computed -->
            <UBadge
              :color="auth.isAuthenticated ? 'success' : 'error'"
              variant="subtle"
              size="xs"
              class="ml-auto"
            >
              {{ auth.isAuthenticated ? "Authenticated" : "Not authenticated" }}
            </UBadge>
          </div>
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">Username</dt>
          <dd>{{ auth.username }}</dd>
          <dt class="text-muted">Email</dt>
          <dd>{{ auth.info?.email }}</dd>
          <dt class="text-muted">Superuser</dt>
          <dd>
            <UBadge
              :color="auth.info?.is_superuser ? 'success' : 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ auth.info?.is_superuser ?? false }}
            </UBadge>
          </dd>
          <dt class="text-muted">Groups</dt>
          <dd>{{ auth.info?.groups?.join(", ") || "—" }}</dd>
        </dl>
      </UCard>

      <!-- Tests 6.2: hasPermission() -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-key" class="size-4 text-muted" />
            <span class="font-medium text-sm">hasPermission()</span>
          </div>
        </template>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <code class="bg-elevated px-1 rounded text-xs">{{
              knownPerm
            }}</code>
            <UBadge
              :color="checkPermission(knownPerm) ? 'success' : 'error'"
              variant="subtle"
              size="xs"
            >
              {{ checkPermission(knownPerm) }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <code class="bg-elevated px-1 rounded text-xs">{{
              unknownPerm
            }}</code>
            <UBadge
              :color="checkPermission(unknownPerm) ? 'success' : 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ checkPermission(unknownPerm) }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <!-- Tests 6.1: all permissions list -->
      <UCard v-if="auth.permissions?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shield-check" class="size-4 text-muted" />
            <span class="font-medium text-sm"
              >All Permissions ({{ auth.permissions.length }})</span
            >
          </div>
        </template>
        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="perm in auth.permissions"
            :key="perm"
            variant="outline"
            color="neutral"
            size="xs"
          >
            {{ perm }}
          </UBadge>
        </div>
      </UCard>

      <!-- Tests 6.3, middleware §2.4: pagePermissions populated by { model: 'article' } -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-layers" class="size-4 text-muted" />
            <span class="font-medium text-sm"
              >pagePermissions[routeName] — model: article</span
            >
          </div>
        </template>
        <div v-if="pagePerms.length" class="flex flex-wrap gap-1.5">
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
        <p v-else class="text-xs text-muted">
          No page permissions (user lacks view_article).
        </p>
      </UCard>
    </div>
  </UContainer>
</template>

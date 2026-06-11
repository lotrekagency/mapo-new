<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore, useRoute } from "#imports";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth", "permissions"],
  label: "Auth Example",
  icon: "i-lucide-user-check",
  permissions: { model: "user" },
});

const auth = useAuthStore();
const route = useRoute();
const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
</script>

<template>
  <UContainer class="py-8">
    <h1 class="text-2xl font-bold mb-6">Auth Example</h1>

    <div class="grid gap-4">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-user" class="size-4 text-muted" />
            <span class="font-medium text-sm">User Info</span>
          </div>
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">Username</dt>
          <dd>{{ auth.username }}</dd>
          <dt class="text-muted">Email</dt>
          <dd>{{ auth.info?.email }}</dd>
          <dt class="text-muted">Role</dt>
          <dd>{{ auth.role }}</dd>
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
        </dl>
      </UCard>

      <UCard v-if="auth.permissions?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shield-check" class="size-4 text-muted" />
            <span class="font-medium text-sm">All Permissions</span>
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

      <UCard v-if="pagePerms.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-key" class="size-4 text-muted" />
            <span class="font-medium text-sm"
              >Page Permissions (user model)</span
            >
          </div>
        </template>
        <div class="flex flex-wrap gap-1.5">
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
      </UCard>
    </div>
  </UContainer>
</template>

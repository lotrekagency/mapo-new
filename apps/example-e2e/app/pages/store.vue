<script setup lang="ts">
// Tests: useSidebarStore toggle/mini/open state and cookie persistence.
// useSnackStore queue (show, dismiss, dismissAll).
// useAuthStore state introspection.
// E2E plan: e2e/modules/store.md §2–4, e2e/uikit/sidebar.md §2
import { useAuthStore, useSnackStore, useSidebarStore } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Store Inspector",
  icon: "i-lucide-database",
  middleware: ["auth"],
});

const auth = useAuthStore();
const snack = useSnackStore();
const sidebar = useSidebarStore();

// Counts how many snacks are currently in the queue for display.
const snackCount = computed(() => snack.messages?.length ?? 0);
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Store Inspector</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/modules/store.md</code> — sidebar, snack, confirm
        stores.
      </p>
    </div>

    <!-- useSidebarStore -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-panel-left" class="size-4 text-primary" />
          <span class="font-semibold text-sm text-highlighted"
            >useSidebarStore</span
          >
        </div>
      </template>

      <div class="space-y-4">
        <!-- Tests 4.1–4.3: toggle, mini, persistence -->
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">open</dt>
          <dd>
            <UBadge
              :color="sidebar.drawer ? 'success' : 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ sidebar.drawer }}
            </UBadge>
          </dd>
          <dt class="text-muted">mini</dt>
          <dd>
            <UBadge
              :color="sidebar.mini ? 'warning' : 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ sidebar.mini }}
            </UBadge>
          </dd>
        </dl>

        <div class="flex flex-wrap gap-3">
          <!-- Tests 4.1: toggle drawer -->
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-panel-left"
            @click="sidebar.toggleDrawer()"
          >
            Toggle drawer
          </UButton>
          <!-- Tests 4.2: set mini -->
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-minimize-2"
            @click="sidebar.toggleMini()"
          >
            Toggle mini
          </UButton>
        </div>

        <p class="text-xs text-muted">
          After toggling, hard-refresh the page — state should persist via
          cookie (test 4.3).
        </p>
      </div>
    </UCard>

    <!-- useSnackStore -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="size-4 text-primary" />
          <span class="font-semibold text-sm text-highlighted"
            >useSnackStore</span
          >
          <UBadge
            v-if="snackCount"
            color="primary"
            variant="subtle"
            size="xs"
            class="ml-auto"
          >
            {{ snackCount }} in queue
          </UBadge>
        </div>
      </template>

      <div class="flex flex-wrap gap-3">
        <!-- Tests 2.1: show() adds to queue -->
        <UButton
          variant="outline"
          color="neutral"
          @click="snack.show('Test message from Store Inspector.', 'info')"
        >
          show() info
        </UButton>
        <!-- Tests 2.3: dismissAll -->
        <UButton variant="outline" color="error" @click="snack.dismissAll?.()">
          dismissAll()
        </UButton>
      </div>
    </UCard>

    <!-- useAuthStore -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-user" class="size-4 text-primary" />
          <span class="font-semibold text-sm text-highlighted"
            >useAuthStore</span
          >
        </div>
      </template>

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">isAuthenticated</dt>
        <dd>
          <UBadge
            :color="auth.isAuthenticated ? 'success' : 'error'"
            variant="subtle"
            size="xs"
          >
            {{ auth.isAuthenticated }}
          </UBadge>
        </dd>
        <dt class="text-muted">username</dt>
        <dd>{{ auth.username }}</dd>
        <dt class="text-muted">permissions count</dt>
        <dd>{{ auth.permissions?.length ?? 0 }}</dd>
      </dl>

      <!-- Tests 1.3 (store §5.1): cookie persistence — instructions for manual check -->
      <p class="text-xs text-muted mt-4">
        Hard-refresh after login — store should re-hydrate from cookie (test
        store §5.1).
      </p>
    </UCard>
  </div>
</template>

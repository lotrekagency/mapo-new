<script setup lang="ts">
// Tests: meta.sidebarFooter = true — this route appears at the bottom of the sidebar,
// not in the main nav list. Also tests logout flow: cookie removed, redirect to /login.
// E2E plan: e2e/uikit/sidebar.md §5, e2e/uikit/login.md §6
import { useMapoAuth, useAuthStore } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Settings",
  icon: "i-lucide-settings",
  sidebarFooter: true, // renders in footer area of sidebar (test §5.1)
  middleware: ["auth"],
});

const { logout } = useMapoAuth();
const auth = useAuthStore();
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-6 text-highlighted">Settings</h1>

    <div class="space-y-4">
      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >Current session</span
          >
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">Username</dt>
          <dd>{{ auth.username }}</dd>
          <dt class="text-muted">Superuser</dt>
          <dd>{{ auth.info?.is_superuser ?? false }}</dd>
        </dl>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted">Logout</span>
        </template>
        <p class="text-muted text-sm mb-4">
          Clicking logout calls
          <code class="bg-elevated px-1 rounded">useMapoAuth().logout()</code>,
          which POSTs to the logout endpoint, removes the session cookie, and
          redirects to /login.
        </p>
        <!-- Tests login §6.1: logout removes cookie and redirects -->
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-log-out"
          @click="logout()"
        >
          Logout
        </UButton>
      </UCard>

      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >What to verify</span
          >
        </template>
        <ul class="space-y-2 text-sm text-muted list-disc list-inside">
          <li>
            This link appears at the <strong>bottom</strong> of the sidebar
            (sidebarFooter: true)
          </li>
          <li>It is NOT in the main navigation list</li>
          <li>After logout → redirected to /login</li>
          <li>
            Navigating to / after logout → redirected to /login again (test
            §6.2)
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>

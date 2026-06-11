<script setup lang="ts">
import { useMapoAuth } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Settings",
  icon: "i-lucide-settings",
  sidebarFooter: true,
});

const { logout } = useMapoAuth();
</script>

<template>
  <UContainer class="py-8">
    <h1 class="text-2xl font-bold mb-6">Settings</h1>
    <UCard>
      <p class="text-muted text-sm mb-4">This is the settings page.</p>
      <UButton
        color="error"
        variant="subtle"
        icon="i-lucide-log-out"
        @click="logout()"
      >
        Logout
      </UButton>
    </UCard>
  </UContainer>
</template>

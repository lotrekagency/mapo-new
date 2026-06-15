<script setup lang="ts">
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";
import { useMapoAuth } from "@mapomodule/core/runtime/auth/useMapoAuth";

withDefaults(
  defineProps<{
    /** When true, renders a compact avatar-only version (sidebar mini mode). */
    mini?: boolean;
  }>(),
  { mini: false },
);

const auth = useAuthStore();
const { logout } = useMapoAuth();
</script>

<template>
  <template v-if="auth.isAuthenticated">
    <div
      class="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-default/60 transition-colors cursor-default"
      :class="mini ? 'justify-center' : ''"
    >
      <UTooltip v-if="mini" :text="auth.username ?? 'User'" side="right">
        <UAvatar
          :alt="auth.username ?? 'User'"
          size="xs"
          class="shrink-0 cursor-pointer"
          @click="logout()"
        />
      </UTooltip>
      <template v-else>
        <UAvatar :alt="auth.username ?? 'User'" size="xs" class="shrink-0" />
        <span class="flex-1 text-xs truncate text-muted font-medium">{{
          auth.username
        }}</span>
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-log-out"
          size="xs"
          aria-label="Logout"
          @click="logout()"
        />
      </template>
    </div>
  </template>
  <template v-else>
    <NuxtLink
      to="/login"
      class="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted hover:bg-default/60 transition-colors"
      :class="{ 'justify-center': mini }"
    >
      <UIcon name="i-lucide-log-in" class="size-4 shrink-0" />
      <span v-if="!mini" class="text-xs font-medium">Sign in</span>
    </NuxtLink>
  </template>
</template>

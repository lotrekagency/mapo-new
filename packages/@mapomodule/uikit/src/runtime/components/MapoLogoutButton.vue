<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useMapoAuth } from "@mapomodule/core/runtime/auth/useMapoAuth";

withDefaults(
  defineProps<{
    /** Nuxt UI UButton `variant` prop. */
    variant?: "solid" | "outline" | "soft" | "ghost" | "link";
    /** Nuxt UI UButton `color` prop. */
    color?:
      | "primary"
      | "secondary"
      | "neutral"
      | "info"
      | "success"
      | "warning"
      | "error";
    /** Nuxt UI UButton `size` prop. */
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    /** Show only the icon (no label). */
    iconOnly?: boolean;
  }>(),
  {
    variant: "ghost",
    color: "neutral",
    size: "sm",
    iconOnly: false,
  },
);

const { t } = useI18n();
const { logout } = useMapoAuth();
</script>

<template>
  <UButton
    :variant="variant"
    :color="color"
    :size="size"
    icon="i-lucide-log-out"
    :aria-label="iconOnly ? t('mapo.logout') : undefined"
    @click="logout()"
  >
    <span v-if="!iconOnly">
      <slot>{{ t("mapo.logout") }}</slot>
    </span>
  </UButton>
</template>

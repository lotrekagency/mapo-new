<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
// @ts-expect-error — #imports is a Nuxt virtual module resolved at app build time
import { useColorMode } from "#imports";

const { t } = useI18n();
const colorMode = useColorMode();

const isDark = computed(() => colorMode.value === "dark");

function toggle() {
  colorMode.preference = isDark.value ? "light" : "dark";
}
</script>

<template>
  <UButton
    :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
    variant="ghost"
    color="neutral"
    :aria-label="
      isDark ? t('mapo.themeToggle.light') : t('mapo.themeToggle.dark')
    "
    @click="toggle"
  />
</template>

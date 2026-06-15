<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Theme Overview",
  icon: "i-lucide-palette",
});
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">
        Mapo Theming — All Customization Types
      </h1>
      <p class="text-muted mt-1">
        This app exercises every theming and override mechanism available in
        Mapo v2.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="item in sections" :key="item.to">
        <NuxtLink :to="item.to" class="flex items-start gap-3">
          <div
            class="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
          >
            <UIcon :name="item.icon" class="size-5 text-primary" />
          </div>
          <div>
            <p class="font-semibold text-highlighted">
              {{ item.title }}
            </p>
            <p class="text-sm text-muted mt-0.5">
              {{ item.desc }}
            </p>
          </div>
        </NuxtLink>
      </UCard>
    </div>

    <UAlert
      color="info"
      variant="soft"
      icon="i-lucide-info"
      title="How this app works"
      description="Check nuxt.config.ts, app/assets/css/theme.css, and app/mapooverride/ to see all customization layers in action."
    />
  </div>
</template>

<script lang="ts">
const sections = [
  {
    to: "/css-tokens",
    icon: "i-lucide-droplets",
    title: "CSS Token Overrides",
    desc: "Primary color, semantic tokens, radius, borders via mapo.uikit.css",
  },
  {
    to: "/nuxt-ui-config",
    icon: "i-lucide-sliders-horizontal",
    title: "Nuxt UI Component Config",
    desc: "Global component defaults via mapo.uikit.ui in nuxt.config.ts",
  },
  {
    to: "/mapoverride",
    icon: "i-lucide-replace",
    title: "MapoOverride Components",
    desc: "Full component replacement via app/mapooverride/ directory",
  },
  {
    to: "/slots",
    icon: "i-lucide-layout-template",
    title: "Layout Slots",
    desc: "sidebar:logo, topbar:right, etc. — in-page slot overrides",
  },
  {
    to: "/dark-mode",
    icon: "i-lucide-sun-moon",
    title: "Dark / Light Mode",
    desc: "Semantic token behavior in both color schemes",
  },
];
</script>

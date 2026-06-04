<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Dark Mode",
  icon: "i-lucide-sun-moon",
  parent: "index",
});

const colorMode = useColorMode();

function set(mode: "light" | "dark" | "system") {
  colorMode.preference = mode;
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-8">
    <div>
      <h1 class="text-xl font-bold text-highlighted">Dark / Light Mode</h1>
      <p class="text-muted text-sm mt-1">
        Nuxt UI v3 + Tailwind v4 provide full dark-mode support via the
        <code class="text-primary">dark</code> class on
        <code>&lt;html&gt;</code>. All semantic tokens in
        <code>theme.css</code> have a <code>.dark {}</code> block.
      </p>
    </div>

    <!-- Toggle -->
    <div class="flex gap-2">
      <UButton
        v-for="mode in ['light', 'dark', 'system'] as const"
        :key="mode"
        :variant="colorMode.preference === mode ? 'solid' : 'outline'"
        @click="set(mode)"
      >
        {{ mode }}
      </UButton>
      <UBadge color="neutral" variant="soft" class="ml-auto self-center">
        Current: {{ colorMode.value }}
      </UBadge>
    </div>

    <!-- Token matrix -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">Semantic token matrix</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 rounded-lg border border-default bg-default">
          <p class="font-mono text-xs text-muted mb-1">--ui-bg</p>
          <p class="text-highlighted">Page background</p>
        </div>
        <div class="p-3 rounded-lg border border-default bg-elevated">
          <p class="font-mono text-xs text-muted mb-1">--ui-bg-elevated</p>
          <p class="text-highlighted">Cards, popovers</p>
        </div>
        <div class="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <p class="font-mono text-xs text-primary mb-1">--color-primary-500</p>
          <p class="text-highlighted">Primary accent</p>
        </div>
        <div class="p-3 rounded-lg border border-default bg-default">
          <p class="font-mono text-xs text-muted mb-1">text colors</p>
          <p class="text-highlighted">Highlighted</p>
          <p class="text-default">Default</p>
          <p class="text-muted">Muted</p>
        </div>
      </div>
    </section>

    <!-- Component samples in current mode -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">Components in current mode</h2>
      <div class="flex flex-wrap gap-3 items-center">
        <UButton>Primary</UButton>
        <UButton color="success" variant="soft"> Success </UButton>
        <UButton color="error" variant="outline"> Error </UButton>
        <UInput placeholder="Input field" class="w-40" />
        <UBadge color="primary"> Badge </UBadge>
        <UBadge color="warning" variant="soft"> Warning </UBadge>
      </div>
      <UCard>
        <p class="text-muted text-sm">
          This card uses <code>--ui-bg-elevated</code> and
          <code>--ui-border</code>. Both are overridden per-mode in theme.css.
        </p>
      </UCard>
    </section>

    <UAlert color="info" variant="soft" icon="i-lucide-info">
      <template #title> Dark mode toggle location </template>
      <template #description>
        The dark-mode toggle button lives in the custom
        <strong>MapoOverride/MapoTopbar.vue</strong> (top-right corner of the
        topbar). It uses Nuxt UI's <code>useColorMode()</code>.
      </template>
    </UAlert>
  </div>
</template>

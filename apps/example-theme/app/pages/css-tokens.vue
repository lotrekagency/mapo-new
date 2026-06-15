<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "CSS Tokens",
  icon: "i-lucide-droplets",
  parent: "index",
});

const primaryShades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const semanticTokens = [
  { name: "--ui-bg", label: "Background (--ui-bg)" },
  { name: "--ui-bg-elevated", label: "Elevated BG (--ui-bg-elevated)" },
  { name: "--ui-border", label: "Border (--ui-border)" },
  { name: "--ui-text", label: "Text (--ui-text)" },
  { name: "--ui-text-muted", label: "Muted text (--ui-text-muted)" },
];
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-10">
    <div>
      <h1 class="text-xl font-bold text-highlighted">CSS Token Overrides</h1>
      <p class="text-muted text-sm mt-1">
        Configured via <code class="text-primary">mapo.uikit.css</code> →
        <code class="text-primary">app/assets/css/theme.css</code>
      </p>
    </div>

    <!-- Primary palette -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        Primary color scale (violet)
      </h2>
      <div class="flex gap-1 flex-wrap">
        <div
          v-for="shade in primaryShades"
          :key="shade"
          class="flex-1 min-w-[3rem] h-12 rounded flex items-end pb-1 justify-center"
          :style="`background: var(--color-primary-${shade})`"
        >
          <span class="text-[10px] font-mono text-white/80 drop-shadow">{{
            shade
          }}</span>
        </div>
      </div>
    </section>

    <!-- Semantic color swatches -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">Status colors</h2>
      <div class="flex gap-3 flex-wrap">
        <UBadge color="success" variant="solid" size="lg"> Success </UBadge>
        <UBadge color="warning" variant="solid" size="lg"> Warning </UBadge>
        <UBadge color="error" variant="solid" size="lg"> Error </UBadge>
        <UBadge color="info" variant="solid" size="lg"> Info </UBadge>
        <UBadge color="primary" variant="solid" size="lg"> Primary </UBadge>
        <UBadge color="neutral" variant="solid" size="lg"> Neutral </UBadge>
      </div>
    </section>

    <!-- Semantic UI tokens -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">Semantic UI tokens</h2>
      <div class="space-y-2">
        <div
          v-for="token in semanticTokens"
          :key="token.name"
          class="flex items-center gap-3"
        >
          <div
            class="size-8 rounded border border-default shrink-0"
            :style="`background: var(${token.name})`"
          />
          <code class="text-sm text-primary">{{ token.name }}</code>
          <span class="text-sm text-muted">{{ token.label }}</span>
        </div>
      </div>
    </section>

    <!-- Radius -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        Border radius (--ui-radius = var(--radius-lg))
      </h2>
      <div class="flex gap-4 items-end flex-wrap">
        <div
          class="w-16 h-16 bg-primary/20 border-2 border-primary rounded"
          style="border-radius: var(--ui-radius)"
        >
          <span class="text-xs text-muted text-center block mt-1"
            >ui-radius</span
          >
        </div>
        <UCard class="w-40 p-3 text-sm text-muted">
          Card with overridden radius
        </UCard>
        <UButton>Button</UButton>
        <UInput placeholder="Input" class="w-36" />
      </div>
    </section>

    <!-- Source -->
    <UAlert color="neutral" variant="outline" icon="i-lucide-file-code">
      <template #title>
        Source: <code>app/assets/css/theme.css</code>
      </template>
    </UAlert>
  </div>
</template>

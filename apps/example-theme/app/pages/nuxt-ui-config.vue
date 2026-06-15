<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Nuxt UI Config",
  icon: "i-lucide-sliders-horizontal",
  parent: "index",
});
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-10">
    <div>
      <h1 class="text-xl font-bold text-highlighted">
        Nuxt UI Component Config
      </h1>
      <p class="text-muted text-sm mt-1">
        Configured via <code class="text-primary">mapo.uikit.ui</code> in
        <code class="text-primary">nuxt.config.ts</code>. Deep-merged into
        <code class="text-primary">nuxt.options.ui</code> — affects every
        component instance globally.
      </p>
    </div>

    <!-- Button defaults -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        UButton — defaultVariants: { color: "primary", variant: "solid" }
      </h2>
      <p class="text-sm text-muted">
        No explicit props → resolves to primary/solid globally.
      </p>
      <div class="flex gap-3 flex-wrap items-center">
        <UButton>Default (primary/solid)</UButton>
        <UButton color="success"> Success override </UButton>
        <UButton variant="outline"> Outline override </UButton>
        <UButton variant="ghost" color="neutral"> Ghost neutral </UButton>
        <UButton variant="soft" color="error"> Soft error </UButton>
      </div>
    </section>

    <!-- Card slot class -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        UCard — root slot: "rounded-xl shadow-md"
      </h2>
      <p class="text-sm text-muted">
        Cards globally get extra rounding + shadow without specifying a class.
      </p>
      <div class="grid grid-cols-2 gap-4">
        <UCard>
          <template #header>
            <span class="font-medium">Card A</span>
          </template>
          Auto-styled via global ui config
        </UCard>
        <UCard>
          <template #header>
            <span class="font-medium">Card B</span>
          </template>
          Same default everywhere
        </UCard>
      </div>
    </section>

    <!-- Input defaults -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        UInput — defaultVariants: { variant: "outline" }
      </h2>
      <div class="flex gap-3 flex-wrap items-start">
        <UInput placeholder="Default (outline)" class="w-48" />
        <UInput placeholder="Explicit none" variant="none" class="w-48" />
      </div>
    </section>

    <!-- How it works note -->
    <UAlert color="info" variant="soft" icon="i-lucide-info">
      <template #title> How it works </template>
      <template #description>
        <code>mapo.uikit.ui</code> is spread onto
        <code>nuxt.options.ui</code> in
        <code>@mapomodule/uikit/src/module.ts</code> during build. The consuming
        app's own <code>nuxt.options.ui</code> values take precedence (app wins
        over module).
      </template>
    </UAlert>
  </div>
</template>

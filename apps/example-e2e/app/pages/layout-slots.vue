<script setup lang="ts">
// Tests: mapo-default layout structure — sidebar + topbar + main content area.
// Layout slot injection (sidebar:logo, topbar:right) is configured in app.vue
// and applies globally; this page documents the checklist for manual verification.
// Also tests mapo-empty layout via the link below.
// E2E plan: e2e/uikit/layout.md §1–4, e2e/uikit/sidebar.md §6
definePageMeta({
  layout: "mapo-custom",
  label: "Layout",
  icon: "i-lucide-layout-template",
  middleware: ["auth"],
});
</script>

<template>
  <UContainer class="py-8 max-w-xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">Layout</h1>
    <p class="text-muted text-sm mb-6">
      E2E plan: <code>e2e/uikit/layout.md</code> — mapo-default shell and slot
      system.
    </p>

    <div class="space-y-4">
      <!-- Tests layout §1.1: sidebar + topbar visible with mapo-default -->
      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >Structure (mapo-default)</span
          >
        </template>
        <ul class="space-y-2 text-sm text-muted list-disc list-inside">
          <li>Sidebar visible on the left (test 1.1)</li>
          <li>Topbar visible at the top (test 1.1)</li>
          <li>
            This content renders in the main area — default slot (test 2.5)
          </li>
        </ul>
      </UCard>

      <!-- Tests layout §1.2: mapo-empty has no sidebar/topbar -->
      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >mapo-empty layout</span
          >
        </template>
        <p class="text-muted text-sm mb-3">
          The <code class="bg-elevated px-1 rounded">mapo-empty</code> layout
          renders only the default slot — no sidebar, no topbar.
        </p>
        <NuxtLink to="/layout-empty">
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            leading-icon="i-lucide-external-link"
          >
            Open layout-empty page
          </UButton>
        </NuxtLink>
      </UCard>

      <!-- Tests layout §2.1–2.4: active slot overrides in mapo-custom layout -->
      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >Active slot overrides (mapo-custom layout)</span
          >
        </template>
        <ul class="space-y-2 text-sm text-muted list-disc list-inside">
          <li>
            <code>#sidebar:logo</code> — sostituisce il logo Mapo con icona +
            nome "E2E Admin"
          </li>
          <li>
            <code>#sidebar:nav-bottom</code> — aggiunge un link GitHub sotto la
            navigazione
          </li>
          <li>
            <code>#topbar:right</code> — aggiunge campanella notifiche e avatar
            utente "EA"
          </li>
        </ul>
      </UCard>

      <!-- Tests layout §4: scroll behaviour -->
      <UCard>
        <template #header>
          <span class="font-semibold text-sm text-highlighted"
            >Scroll & overflow (tests §4)</span
          >
        </template>
        <ul class="space-y-2 text-sm text-muted list-disc list-inside">
          <li>
            Only the main content area should scroll on tall content (4.1)
          </li>
          <li>Topbar stays sticky at top during scroll (4.3)</li>
          <li>Sidebar has its own scroll if nav list is tall (4.2)</li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>

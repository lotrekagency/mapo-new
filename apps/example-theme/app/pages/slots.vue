<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Layout Slots",
  icon: "i-lucide-layout-template",
  parent: "index",
});
</script>

<!--
  This page intentionally uses the layout slots to customise the shell.
  The layout is overridden via the <NuxtLayout> wrapper below.
  Because definePageMeta sets layout: "mapo-default", we use the default slot
  approach here — or you can use a wrapping layout page that passes named slots.
-->
<template>
  <!--
    Layout slots are passed via NuxtLayout from app.vue when you need per-page
    customization without a full MapoOverride. The mapo-default layout exposes:

    sidebar:logo       — replaces the Mapo logo link
    sidebar:nav-top    — content above the auto-nav
    sidebar:nav-bottom — content below the auto-nav
    sidebar:footer     — replaces the user avatar / logout row
    topbar:left        — content left of the flex spacer
    topbar             — replaces the center area
    topbar:right       — appended to the topbar right section
  -->
  <div class="p-6 max-w-3xl mx-auto space-y-8">
    <div>
      <h1 class="text-xl font-bold text-highlighted">Layout Slots</h1>
      <p class="text-muted text-sm mt-1">
        The <code class="text-primary">mapo-default</code> layout exposes named
        slots for per-page (or per-layout) customization without replacing whole
        components.
      </p>
    </div>

    <UCard>
      <template #header>
        <span class="font-semibold">mapo-default slot API</span>
      </template>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left">
              <th class="pb-2 font-semibold text-highlighted">Slot</th>
              <th class="pb-2 font-semibold text-highlighted pl-4">
                Where it renders
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="slot in slots" :key="slot.name">
              <td class="py-2 font-mono text-primary">
                {{ slot.name }}
              </td>
              <td class="py-2 text-muted pl-4">
                {{ slot.desc }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">Usage example (app.vue)</span>
      </template>
      <pre
        class="text-xs text-muted overflow-x-auto p-2 bg-elevated rounded"
      ><code>{{ usageExample }}</code></pre>
    </UCard>

    <UAlert color="info" variant="soft" icon="i-lucide-lightbulb">
      <template #title> Tip </template>
      <template #description>
        Slot overrides apply to a single page. For app-wide changes use
        <strong>MapoOverride</strong> (whole component replacement) or
        <strong>mapo.uikit.css / ui</strong> (style / config).
      </template>
    </UAlert>
  </div>
</template>

<script lang="ts">
const slots = [
  {
    name: "sidebar:logo",
    desc: "Replaces the Mapo logo / app name link in the sidebar header",
  },
  {
    name: "sidebar:nav-top",
    desc: "Content injected above the auto-generated navigation list",
  },
  {
    name: "sidebar:nav-bottom",
    desc: "Content injected below the navigation list, above the footer",
  },
  {
    name: "sidebar:footer",
    desc: "Replaces the user avatar + logout row at the bottom of the sidebar",
  },
  {
    name: "topbar:left",
    desc: "Injected immediately after the drawer toggle button",
  },
  { name: "topbar", desc: "Replaces the flex-1 center area of the topbar" },
  {
    name: "topbar:right",
    desc: "Appended to the right cluster of the topbar (after existing items)",
  },
  { name: "default", desc: "The main page content area (always required)" },
];

const usageExample = `<!-- app.vue or a custom layout -->
<NuxtLayout name="mapo-default">
  <template #sidebar:logo>
    <img src="/logo.svg" class="h-8" />
  </template>

  <template #topbar:right>
    <UButton icon="i-lucide-bell" variant="ghost" color="neutral" />
    <UAvatar src="/avatar.jpg" size="xs" />
  </template>

  <NuxtPage />
</NuxtLayout>`;
</script>

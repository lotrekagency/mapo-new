<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "MapoOverride",
  icon: "i-lucide-replace",
  parent: "index",
});

const overrides = [
  {
    component: "MapoTopbar",
    file: "app/mapooverride/MapoTopbar.vue",
    what: "Adds a gradient background, custom brand badge, and a dark-mode toggle button.",
    active: true,
  },
  {
    component: "MapoLogin",
    file: "app/mapooverride/MapoLogin.vue",
    what: "Fully custom login layout with custom branding, uses useMapoAuth internally.",
    active: true,
  },
];
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-8">
    <div>
      <h1 class="text-xl font-bold text-highlighted">
        MapoOverride Component System
      </h1>
      <p class="text-muted text-sm mt-1">
        Place <code class="text-primary">.vue</code> files in
        <code class="text-primary">app/mapooverride/</code> matching a Mapo
        component name to fully replace it at build time.
      </p>
    </div>

    <!-- How it works -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-wrench" class="text-primary" />
          <span class="font-semibold">How it works</span>
        </div>
      </template>
      <ol class="list-decimal list-inside space-y-2 text-sm text-muted">
        <li>
          Create
          <code class="text-primary">app/mapooverride/MapoTopbar.vue</code>
          (or any other Mapo component name).
        </li>
        <li>
          The <code class="text-primary">@mapomodule/uikit</code> module hooks
          into Nuxt's <code class="text-primary">components:extend</code> at
          build time and replaces the default component's
          <code>filePath</code> with your file.
        </li>
        <li>
          Your component is used everywhere the original would appear — no
          imports needed.
        </li>
        <li>
          Keep props and slots compatible with the original contract (TypeScript
          interfaces will be added per-component in a future phase).
        </li>
      </ol>
    </UCard>

    <!-- Active overrides in this app -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        Active overrides in this app
      </h2>
      <div class="space-y-3">
        <UCard v-for="item in overrides" :key="item.component">
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <code class="text-primary font-semibold">{{
                  item.component
                }}</code>
                <UBadge
                  v-if="item.active"
                  color="success"
                  variant="soft"
                  size="xs"
                >
                  active
                </UBadge>
              </div>
              <p class="text-sm text-muted">
                {{ item.what }}
              </p>
              <p class="text-xs text-muted font-mono">
                {{ item.file }}
              </p>
            </div>
            <UIcon
              name="i-lucide-check-circle"
              class="text-success shrink-0 size-5"
            />
          </div>
        </UCard>
      </div>
    </section>

    <!-- Overridable components list -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">All overridable components</h2>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="name in [
            'MapoTopbar',
            'MapoSidebar',
            'MapoSidebarList',
            'MapoSidebarListItem',
            'MapoLogin',
            'MapoSnackBar',
            'MapoConfirmDialog',
            'MapoRootComponents',
          ]"
          :key="name"
          color="neutral"
          variant="outline"
        >
          {{ name }}
        </UBadge>
      </div>
      <p class="text-xs text-muted">
        Create a matching file in <code>app/mapooverride/</code> to override any
        of these.
      </p>
    </section>
  </div>
</template>

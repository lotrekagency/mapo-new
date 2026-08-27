<script setup lang="ts"></script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <template #sidebar:logo>
        <NuxtLink to="/" class="flex items-center gap-2.5 min-w-0">
          <div
            class="size-7 rounded-lg bg-primary flex items-center justify-center shrink-0"
          >
            <UIcon name="i-lucide-layers" class="size-4 text-white" />
          </div>
          <span class="font-semibold text-sm text-highlighted truncate"
            >Example App</span
          >
        </NuxtLink>
      </template>

      <template #topbar:right>
        <MapoLangSwitcher size="sm" />
        <MapoThemeToggle />
      </template>

      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

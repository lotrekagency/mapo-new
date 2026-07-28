<template>
  <UApp>
    <NuxtLayout>
      <!-- Language switcher available on every page, so any scenario can be
           re-checked in a second locale without leaving it. -->
      <template #topbar:right>
        <MapoLangSwitcher size="sm" />
      </template>

      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

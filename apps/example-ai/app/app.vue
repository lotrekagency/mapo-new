<template>
  <UApp>
    <NuxtLayout>
      <template #topbar:right>
        <!-- Development only: one click to another account of the mock. -->
        <DevUserSwitcher />
        <MapoLangSwitcher size="sm" />
      </template>

      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";

const { t } = useI18n();
const store = useConfirmStore();
</script>

<template>
  <UModal v-model:open="store.active" :dismissible="false">
    <template #content>
      <div class="p-6 space-y-4">
        <div class="space-y-1">
          <h3 class="text-base font-semibold text-highlighted">
            {{ store.options?.title ?? t("mapo.confirm") }}
          </h3>
          <p class="text-sm text-muted">
            {{ store.options?.message }}
          </p>
        </div>

        <div class="flex justify-end gap-3">
          <UButton variant="ghost" color="neutral" @click="store.cancel()">
            {{ store.options?.cancelText ?? t("mapo.cancel") }}
          </UButton>
          <UButton
            :color="store.options?.dangerous ? 'error' : 'primary'"
            @click="store.confirm()"
          >
            {{ store.options?.confirmText ?? t("mapo.confirm") }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

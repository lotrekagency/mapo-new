<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";

const { t } = useI18n();
const store = useConfirmStore();

// Nuxt UI gives overlays no z-index: they stack in the order their portals sit
// in <body>, and a portal takes its place there when its overlay mounts.
// Mounted with the layout, this modal would come before every overlay a page
// opens later, such as the media editor drawer, and show under it while the
// drawer takes every click. So it mounts when a confirmation is asked, above
// whatever asked for it, and unmounts once its close animation has ended.
const modalMounted = ref(store.active);

watch(
  () => store.active,
  (active) => {
    if (active) modalMounted.value = true;
  },
);

function onAfterLeave() {
  // Asked again while the previous dialog was closing: it is open again.
  if (store.active) return;
  modalMounted.value = false;
}
</script>

<template>
  <UModal
    v-if="modalMounted"
    v-model:open="store.active"
    :dismissible="false"
    @after:leave="onAfterLeave"
  >
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

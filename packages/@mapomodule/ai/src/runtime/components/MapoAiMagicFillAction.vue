<script setup lang="ts">
/**
 * Magic Fill's button, in the detail's sidebar card above Save: it opens
 * the panel. It shows to a user the app lets use the AI, on a record they
 * may edit, and says why it is off when no AI model can be called for
 * them. The module adds it to every `MapoDetail`, with the banner above
 * the form; a page turns both off with `definePageMeta({ magicFill: false })`.
 */
import { computed, onBeforeUnmount } from "vue";
import {
  joinMagicFill,
  useMapoAiMagicFill,
} from "../composables/useMapoAiMagicFill";
import type { MapoAiMagicFillDetail } from "../composables/useMapoAiMagicFill";

const props = defineProps<{
  /** The detail it fills: the context of `MapoDetail`, from `useMapoDetail()`. */
  detail: MapoAiMagicFillDetail;
}>();

const magic = useMapoAiMagicFill(props.detail);
const { t, available, choices, phase, open } = magic;
const presence = joinMagicFill(magic, "action");
onBeforeUnmount(presence.leave);
// The first of the button and the banner renders the panel.
const { isFirst: rendersPanel } = presence;

const hasNoModel = computed(() => choices.value.length === 0);
const isWorking = computed(() => phase.value !== "idle");

function openPanel(): void {
  open.value = true;
}
</script>

<template>
  <div v-if="available" class="space-y-1">
    <UButton
      block
      color="primary"
      variant="soft"
      icon="i-lucide-sparkles"
      :label="t('mapo.ai.magicFill.action')"
      :loading="isWorking"
      :disabled="hasNoModel"
      @click="openPanel"
    />
    <p v-if="hasNoModel" class="text-xs text-muted">
      {{ t("mapo.ai.magicFill.noProvider") }}
    </p>
    <MapoAiMagicFillPanel v-if="rendersPanel" :detail="detail" />
  </div>
</template>

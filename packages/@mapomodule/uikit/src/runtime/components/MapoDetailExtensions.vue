<script setup lang="ts">
import { computed } from "vue";
import { useMapoDetail } from "../composables/useMapoDetail";
import { detailExtensions } from "../composables/defineDetailExtension";
import type { DetailExtensionPlacement } from "../types/detail";

/**
 * Renders the extensions registered with `defineDetailExtension()` for one
 * placement of the surrounding `MapoDetail`, in their order. `MapoDetail` uses
 * it itself; place it in a slot that replaces one of those places, such as
 * `side-buttons`, to keep the extensions there.
 */
const props = defineProps<{
  /** Which extensions: `actions` or `body-top`. */
  placement: DetailExtensionPlacement;
}>();

const detail = useMapoDetail();
const registry = detailExtensions();

const shown = computed(() => {
  if (!detail) return [];
  const allowed = detail.extensions.value;
  if (allowed === false) return [];
  return registry
    .filter((extension) => extension.placement === props.placement)
    .filter((extension) => allowed === true || allowed.includes(extension.key))
    .filter((extension) => extension.visible?.(detail) ?? true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});
</script>

<template>
  <component
    :is="extension.component"
    v-for="extension in shown"
    :key="extension.key"
  />
</template>

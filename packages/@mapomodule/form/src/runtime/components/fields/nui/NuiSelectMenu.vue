<script setup lang="ts">
import { computed } from "vue";
import { useNuiFieldAttrs } from "./useNuiFieldAttrs";
defineOptions({ inheritAttrs: false });
const rawAttrs = useNuiFieldAttrs();
// Accepts both `items` (NUI shape `{ label, value }` or plain strings) and the
// legacy `options` (`{ text, value }`). The registry sets `labelKey: "text"`,
// so mirror `label` into `text` when missing — otherwise NUI-shaped items
// would render with empty labels.
const attrs = computed(() => {
  const { options, items, ...rest } = rawAttrs.value as Record<string, unknown>;
  const list = (items ?? options) as
    | Array<string | Record<string, unknown>>
    | undefined;
  const normalised = list?.map((it) =>
    typeof it === "object" && it !== null
      ? { ...it, text: it.text ?? it.label ?? String(it.value) }
      : it,
  );
  // This wrapper is an untyped passthrough: cast so the dynamic items array
  // satisfies USelectMenu's generic `items` prop.
  return { ...rest, items: normalised as never[] | undefined };
});
</script>
<template>
  <USelectMenu v-bind="attrs" />
</template>

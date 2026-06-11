<script setup lang="ts">
import { watch } from "vue";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useToast } from "@nuxt/ui/composables/useToast";

const snack = useSnackStore();
const toast = useToast();

const _shown = new Set<number>();

watch(
  () => snack.messages,
  (msgs) => {
    if (msgs.length === 0) {
      for (const id of _shown) toast.remove(String(id));
      _shown.clear();
      return;
    }
    for (const msg of msgs) {
      if (_shown.has(msg.id)) continue;
      _shown.add(msg.id);
      toast.add({
        id: String(msg.id),
        title: msg.message,
        color: msg.type as "success" | "error" | "warning" | "info",
        duration: msg.duration,
        // Nuxt UI v4 has no onClose callback: dismissal (user click or
        // timeout) is signalled through the `update:open` emit.
        "onUpdate:open": (open: boolean) => {
          if (!open) snack.dismiss(msg.id);
        },
      });
    }
  },
  { deep: true },
);
</script>

<!-- eslint-disable vue/valid-template-root -->
<template>
  <!-- Nuxt UI v3: toasts are rendered by the global <Toaster> in ConfigProvider -->
</template>

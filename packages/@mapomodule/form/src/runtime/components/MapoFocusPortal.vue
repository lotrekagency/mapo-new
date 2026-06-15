<script setup lang="ts">
/**
 * MapoFocusPortal — Renders full-page editing for a repeater item.
 *
 * Mount only one instance in layout/default or in MapoRootComponents.
 * It activates automatically when `useFocusMode().enter()` is called.
 *
 * @example
 * // In layouts/default.vue
 * <MapoFocusPortal />
 */
import { computed, ref, onMounted, onUnmounted } from "vue";
import { watch } from "vue";
import { useFocusMode } from "../composables/useFocusMode.js";
import MapoForm from "./MapoForm.vue";

const { focusTarget, exit } = useFocusMode();

const isOpen = computed(() => focusTarget.value !== null);
const canUseDocument = typeof document !== "undefined";

// Close on ESC.
function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && isOpen.value) exit();
}
onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

// Lock body scroll while the portal is open.
watch(isOpen, (open) => {
  if (!canUseDocument) return;
  document.body.style.overflow = open ? "hidden" : "";
});

// Local model for the sub-form, kept in two-way sync with the focus target.
const localModel = ref<Record<string, unknown>>({});

watch(
  () => focusTarget.value?.model,
  (val) => {
    if (val) localModel.value = { ...val };
  },
  { immediate: true },
);

function onUpdate(val: Record<string, unknown>) {
  localModel.value = val;
  focusTarget.value?.onUpdate(val);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="mapo-focus-portal">
      <div
        v-if="isOpen && focusTarget"
        class="mapo-focus-portal fixed inset-0 z-[9999] flex flex-col bg-white"
        role="dialog"
        aria-modal="true"
      >
        <!-- ── Header ────────────────────────────────────────────────────── -->
        <div
          class="flex shrink-0 items-center gap-3 border-b border-gray-200 px-6 py-3"
        >
          <!-- Breadcrumb -->
          <nav class="flex min-w-0 flex-1 items-center gap-1 text-sm">
            <template v-for="(crumb, i) in focusTarget.breadcrumb" :key="i">
              <span
                :class="
                  i < focusTarget.breadcrumb.length - 1
                    ? 'text-gray-400'
                    : 'font-semibold text-gray-800'
                "
                class="truncate"
              >
                {{ crumb }}
              </span>
              <UIcon
                v-if="i < focusTarget.breadcrumb.length - 1"
                name="i-lucide-chevron-right"
                class="h-3.5 w-3.5 shrink-0 text-gray-300"
              />
            </template>
          </nav>

          <!-- Close button -->
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            label="Close"
            size="sm"
            @click="exit"
          />
        </div>

        <!-- ── Body: scrollable sub-form ────────────────────────────────── -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto max-w-3xl px-6 py-8">
            <MapoForm
              :model-value="localModel"
              :fields="focusTarget.fields as any"
              :errors="focusTarget.errors.value as any"
              :languages="focusTarget.languages as any"
              :current-lang="focusTarget.currentLang"
              :registry="focusTarget.registry as any"
              @update:model-value="onUpdate"
            />
          </div>
        </div>

        <!-- ── Footer ───────────────────────────────────────────────────── -->
        <div
          class="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-3"
        >
          <p class="mr-auto text-xs text-gray-400">
            <UIcon name="i-lucide-keyboard" class="mr-1 inline h-3 w-3" />
            Press
            <kbd class="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs"
              >ESC</kbd
            >
            to return to the form
          </p>
          <UButton variant="ghost" color="neutral" @click="exit">
            Close
          </UButton>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mapo-focus-portal-enter-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.mapo-focus-portal-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.mapo-focus-portal-enter-from,
.mapo-focus-portal-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
.mapo-focus-portal-enter-to,
.mapo-focus-portal-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>

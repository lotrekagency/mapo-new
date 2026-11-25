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
import {
  computed,
  ref,
  onMounted,
  onUnmounted,
  provide,
  toRaw,
  unref,
} from "vue";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFocusMode } from "../composables/useFocusMode.js";
import type { FocusTarget } from "../composables/useFocusMode.js";
import {
  isTopLayer,
  usePageScrollLock,
  useMountedWhileOpen,
} from "../utils/layers.js";
import MapoForm from "./MapoForm.vue";

const { t } = useI18n();
const { focusTarget, exit } = useFocusMode();

const isOpen = computed(() => focusTarget.value !== null);

// A layer with no z-index, mounted when focus mode opens, so that the menus
// and modals of the item's fields show above it, and the page does not scroll
// under it (see utils/layers.ts).
const { mounted: portalMounted, onAfterLeave } = useMountedWhileOpen(isOpen);
usePageScrollLock(isOpen);
const layerEl = ref<HTMLElement | null>(null);

// Close on ESC when the portal is the top layer: a menu or modal opened from
// the item, or a field expanded in it, takes the key first.
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !isOpen.value || !layerEl.value) return;
  if (isTopLayer(layerEl.value)) exit();
}
onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

// The item's errors. Read through `focusTarget`, which unwraps refs, `errors`
// comes out as its value: `unref` takes it either way.
const itemErrors = computed(
  () => (unref(focusTarget.value?.errors) ?? {}) as Record<string, string[]>,
);

// The sub-form edits a copy of the item, and its fields write into it in
// place. A watcher on the copy's keys hands each edit to the item: MapoForm's
// `update:modelValue` stops once the portal has closed, and a field's
// debounced write can land after that. The objects nested in the copy are the
// item's own: what a field writes inside them (a translation) reaches the item
// directly. Watching them too would hand the item this copy again whenever the
// item edits them, long after focus mode has closed, and undo its later edits.
const localModel = ref<Record<string, unknown>>({});
// The item the copy belongs to. It stays set after exit: a field writes once
// its debounce has run out, so an edit made just before closing lands after
// it, unless focus mode opens again first.
let target: FocusTarget | null = null;

watch(
  () => focusTarget.value,
  (next) => {
    if (!next) return;
    // Copy from the raw target: `focusTarget` is read-only all the way down,
    // and through it the nested objects would come out read-only too. `model`
    // can be a ref.
    target = toRaw(next) as FocusTarget;
    localModel.value = { ...unref(target.model) };
  },
  { immediate: true },
);

// The items of a repeater inside the item get no focus mode button
// (MapoRepeaterItem injects this): opening one would put it in this same
// sub-form, which unmounts the repeater item its edits must reach.
provide("mapoInFocusMode", true);

watch(
  localModel,
  (model, previous) => {
    // A new copy is another item opening, not an edit.
    if (model === previous) target?.onUpdate(model);
  },
  { deep: 1 },
);

// MapoForm emits the copy its fields wrote into, which the watcher hands
// over; only a new object replaces the copy.
function onUpdate(val: Record<string, unknown>) {
  if (val === localModel.value) return;
  localModel.value = val;
  target?.onUpdate(val);
}
</script>

<template>
  <Teleport v-if="portalMounted" to="body">
    <Transition name="mapo-focus-portal" appear @after-leave="onAfterLeave">
      <div
        v-if="isOpen && focusTarget"
        ref="layerEl"
        class="mapo-focus-portal fixed inset-0 flex flex-col bg-white"
        role="dialog"
        aria-modal="true"
        data-mapo-layer
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
            :label="t('mapo.close')"
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
              :errors="itemErrors"
              :notify-errors="false"
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

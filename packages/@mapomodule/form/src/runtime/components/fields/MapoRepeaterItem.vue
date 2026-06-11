<script setup lang="ts">
import { ref, computed, watch, watchEffect } from "vue";
import type {
  AnyFieldDescriptor,
  FieldRegistry,
  RepeaterDescriptor,
} from "../../types/index.js";
import { useMapoForm, injectMapoForm } from "../../composables/useMapoForm.js";
import { useFocusMode } from "../../composables/useFocusMode.js";
import MapoFormField from "../MapoFormField.vue";

const props = defineProps<{
  /** Stable identity-based UID assigned by the parent repeater. */
  uid?: string;
  item: Record<string, unknown>;
  fields: AnyFieldDescriptor[];
  index: number;
  errorPrefix: string;
  parentErrors: Record<string, string[]>;
  languages: string[];
  currentLang: string;
  readonly: boolean;
  registry: FieldRegistry;
  previewLabel?: (item: unknown, index: number) => string;
  defaultExpanded: boolean;
  allowDuplicate?: boolean;
  /** Descriptor of the parent repeater (for miniCard and other attrs). */
  repeaterDescriptor?: RepeaterDescriptor;
  /** Total number of items in the repeater (used to compute contextual scaling). */
  totalItems?: number;
  /** true = this item is selected in bulk mode. */
  selected?: boolean;
  /** true = bulk selection mode is active in the parent repeater. */
  selectionMode?: boolean;
}>();

const emit = defineEmits<{
  "update:item": [value: Record<string, unknown>];
  delete: [];
  duplicate: [];
  "move-up": [];
  "move-down": [];
  "move-to": [index: number];
  /** Emits `true` when the user held Shift to request a range selection. */
  "toggle-select": [withShift: boolean];
}>();

/** Toggle selection from a click event, propagating the shift modifier. */
function toggleSelectFromEvent(e: MouseEvent) {
  emit("toggle-select", e.shiftKey === true);
}

// ─── Local state ─────────────────────────────────────────────────────────────

const expanded = ref(props.defaultExpanded);

const localModel = ref<Record<string, unknown>>({ ...props.item });

// Re-sync the local model when the parent replaces the item object
// (reorder, undo, external splice). Without this watcher, after a reorder the
// reused instance would keep the previous model, causing ghost data on the wrong item.
watch(
  () => props.item,
  (next) => {
    if (next === localModel.value) return;
    localModel.value = { ...next };
  },
);

// MapoFormField mutates model.value in-place (setNestedValueMutating) rather than
// calling emit. Without this watcher the parent repeater never sees those mutations,
// so its items array stays stale — causing data loss when the key changes on
// collapse/expand (remount) or when addItem reads the stale array.
watch(
  localModel,
  (val) => {
    emit("update:item", val);
  },
  { deep: true },
);

// Filter parent errors down to this item: "blocks.0.title" → "title".
const itemErrors = computed<Record<string, string[]>>(() => {
  const result: Record<string, string[]> = {};
  const prefix = `${props.errorPrefix}.`;
  for (const [k, v] of Object.entries(props.parentErrors)) {
    if (k.startsWith(prefix)) result[k.slice(prefix.length)] = v;
  }
  return result;
});

const hasErrors = computed(() => Object.keys(itemErrors.value).length > 0);

// ─── Sub-form context for child fields ───────────────────────────────────────
// Reuse the full form engine (useMapoForm) instead of a hand-rolled context, so the
// item's fields get correct nested-path / translatable / synci18n / accessor / onChange
// handling and real client-side validation — not a stripped-down reimplementation.

const currentLangRef = computed(() => props.currentLang);
const readonly = computed(() => props.readonly);

// Capture the parent context BEFORE useMapoForm provides a new one for this subtree.
const parentCtx = injectMapoForm<Record<string, unknown>>();

// `notifyErrors: false` so each item does not duplicate the root form's error toast.
const form = useMapoForm<Record<string, unknown>>({
  model: localModel,
  fields: computed(() => props.fields),
  errors: itemErrors,
  languages: props.languages,
  currentLang: currentLangRef,
  immediate: parentCtx?.immediate ?? false,
  debounce: parentCtx?.debounce ?? 300,
  notifyErrors: false,
  registry: props.registry,
});

// Inherit readonly + submitted from the root form so its submit() reveals item-level
// validation errors (mirrors MapoForm's nested-form behavior).
watchEffect(() => {
  form.readonly.value = props.readonly;
  if (parentCtx) form.ctx.submitted.value = parentCtx.submitted.value;
});

// ─── Preview label ────────────────────────────────────────────────────────────

const label = computed(
  () =>
    props.previewLabel?.(localModel.value, props.index) ??
    `Item ${props.index + 1}`,
);

// ─── Contextual Scaling (miniCard) ───────────────────────────────────────────

const miniCardAttrs = computed(() => props.repeaterDescriptor?.attrs);

const isCompressed = computed(() => {
  if (expanded.value) return false;
  const threshold = miniCardAttrs.value?.compressThreshold ?? 3;
  const hasMiniCard = !!miniCardAttrs.value?.miniCard;
  return hasMiniCard && (props.totalItems ?? 0) >= threshold;
});

const miniCard = computed(() =>
  miniCardAttrs.value?.miniCard?.(localModel.value, props.index),
);

const statusColorClass = computed(
  () =>
    ({
      success: "bg-green-500",
      info: "bg-blue-500",
      warning: "bg-yellow-500",
      error: "bg-red-500",
      neutral: "bg-gray-400",
    })[miniCard.value?.statusColor ?? "neutral"],
);

// ─── Focus Mode ──────────────────────────────────────────────────────────────

const focusMode = useFocusMode();

function enterFocusMode() {
  focusMode.enter({
    descriptor: props.repeaterDescriptor as AnyFieldDescriptor,
    fields: props.fields,
    model: { ...localModel.value },
    errors: itemErrors,
    onUpdate: (val) => {
      localModel.value = { ...val };
      emit("update:item", localModel.value);
    },
    registry: props.registry,
    languages: props.languages,
    currentLang: props.currentLang,
    breadcrumb: [props.repeaterDescriptor?.label ?? "Repeater", label.value],
  });
}
</script>

<template>
  <div
    class="mapo-repeater-item rounded border transition-all"
    :class="[
      hasErrors ? 'border-red-300' : 'border-gray-200',
      selected && selectionMode ? 'ring-2 ring-primary-500 ring-offset-1' : '',
    ]"
  >
    <!-- ── Mini-card (contextual scaling) ──────────────────────────────────── -->
    <div
      v-if="isCompressed && miniCard"
      class="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50"
      @click="selectionMode ? toggleSelectFromEvent($event) : (expanded = true)"
    >
      <!-- Bulk selection checkbox -->
      <UCheckbox
        v-if="selectionMode"
        :model-value="selected"
        @update:model-value="emit('toggle-select', false)"
        @click.stop
      />

      <!-- Optional thumbnail -->
      <img
        v-if="miniCard.thumbnail"
        :src="miniCard.thumbnail"
        class="h-9 w-9 rounded object-cover"
        alt=""
      />

      <!-- Status dot -->
      <span
        v-if="miniCard.statusColor"
        class="h-2 w-2 shrink-0 rounded-full"
        :class="statusColorClass"
      />

      <!-- Drag handle (mousedown.stop prevents the parent click handler from firing on drag start) -->
      <UIcon
        name="i-lucide-grip-vertical"
        class="drag-handle h-4 w-4 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing"
        @mousedown.stop
        @click.stop
      />

      <!-- Contenuto testuale -->
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-gray-700">
          {{ miniCard.title }}
        </p>
        <p v-if="miniCard.subtitle" class="truncate text-xs text-gray-400">
          {{ miniCard.subtitle }}
        </p>
      </div>

      <!-- Error badge -->
      <UBadge v-if="hasErrors" color="error" variant="soft" size="xs">
        errors
      </UBadge>

      <!-- Quick actions (delete only in mini mode) -->
      <div class="flex items-center gap-1">
        <UButton
          size="xs"
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          :disabled="readonly"
          title="Delete"
          @click.stop="$emit('delete')"
        />
        <UIcon name="i-lucide-chevron-down" class="h-4 w-4 text-gray-400" />
      </div>
    </div>

    <!-- ── Item header (expanded mode) ─────────────────────────────────────── -->
    <div
      v-else
      class="flex items-center gap-2 bg-gray-50 px-3 py-2"
      :class="selectionMode ? 'cursor-pointer hover:bg-gray-100' : ''"
      @click="selectionMode && toggleSelectFromEvent($event)"
    >
      <!-- Bulk selection checkbox -->
      <UCheckbox
        v-if="selectionMode"
        :model-value="selected"
        @update:model-value="emit('toggle-select', false)"
        @click.stop
      />

      <!-- Drag handle (mousedown.stop avoids triggering row-click selection on drag start) -->
      <UIcon
        name="i-lucide-grip-vertical"
        class="drag-handle h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing"
        @mousedown.stop
        @click.stop
      />

      <!-- Collapsed label / error badge. In selection mode the row click handles selection,
           so this button only toggles expansion when not selecting. -->
      <button
        type="button"
        class="flex flex-1 items-center gap-2 text-left text-sm font-medium text-gray-700"
        @click.stop="
          selectionMode ? toggleSelectFromEvent($event) : (expanded = !expanded)
        "
      >
        <span class="truncate">{{ label }}</span>
        <UBadge v-if="hasErrors" color="error" variant="soft" size="xs">
          errors
        </UBadge>
      </button>

      <!-- Action buttons. All buttons stop propagation so the row-click selection handler
           does not also toggle selection when the user clicks an action. -->
      <div class="flex items-center gap-1" @click.stop>
        <slot name="actions" />

        <!-- Numeric position field (enabled via repeaterDescriptor.attrs.showPositionField) -->
        <template
          v-if="repeaterDescriptor?.attrs?.showPositionField && !readonly"
        >
          <UInput
            :model-value="index + 1"
            type="number"
            :min="1"
            :max="totalItems"
            size="xs"
            class="w-14 text-center"
            title="Position"
            @change="
              $emit(
                'move-to',
                Math.max(
                  0,
                  Math.min(
                    totalItems! - 1,
                    Number(($event.target as HTMLInputElement).value) - 1,
                  ),
                ),
              )
            "
          />
        </template>

        <!-- Focus mode -->
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-maximize-2"
          title="Edit full screen"
          @click="enterFocusMode"
        />

        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-chevron-up"
          :disabled="readonly"
          title="Move up"
          @click="$emit('move-up')"
        />
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-chevron-down"
          :disabled="readonly"
          title="Move down"
          @click="$emit('move-down')"
        />

        <UButton
          v-if="allowDuplicate"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-copy"
          :disabled="readonly"
          title="Duplicate"
          @click="$emit('duplicate')"
        />

        <UButton
          size="xs"
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          :disabled="readonly"
          title="Delete"
          @click="$emit('delete')"
        />

        <UIcon
          :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="h-4 w-4 text-gray-400"
          @click="expanded = !expanded"
        />
      </div>
    </div>

    <!-- ── Item body (fields) ──────────────────────────────────────────────── -->
    <!-- COL_SPAN: Tailwind v4 requires static classes — do not use dynamic template literals. -->
    <div v-if="expanded && !isCompressed" class="grid grid-cols-12 gap-5 p-4">
      <div
        v-for="field in fields"
        :key="field.key as string"
        :class="{
          'col-span-1': field.cols === 1,
          'col-span-2': field.cols === 2,
          'col-span-3': field.cols === 3,
          'col-span-4': field.cols === 4,
          'col-span-5': field.cols === 5,
          'col-span-6': field.cols === 6,
          'col-span-7': field.cols === 7,
          'col-span-8': field.cols === 8,
          'col-span-9': field.cols === 9,
          'col-span-10': field.cols === 10,
          'col-span-11': field.cols === 11,
          'col-span-12': !field.cols || field.cols === 12,
        }"
      >
        <MapoFormField :descriptor="field" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { NormalizedRepeaterTemplate } from "../../types/descriptor.js";
import {
  filterTemplates,
  wireframeShapes,
} from "../../utils/repeaterTemplates.js";

const props = defineProps<{
  templates: NormalizedRepeaterTemplate[];
  /** Disables the cards (e.g. `maxItems` reached). */
  disabled?: boolean;
}>();

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  /** `keepOpen` is true when Shift was held, so the caller can add several blocks. */
  select: [key: string, keepOpen: boolean];
}>();

const { t } = useI18n();

const query = ref("");
const category = ref("");

watch(open, (isOpen) => {
  if (isOpen) {
    query.value = "";
    category.value = "";
  }
});

const categories = computed(
  () =>
    [
      ...new Set(props.templates.map((tpl) => tpl.category).filter(Boolean)),
    ] as string[],
);

const filtered = computed(() =>
  filterTemplates(props.templates, query.value, category.value),
);

const shapesFor = wireframeShapes;
function pick(key: string, event: MouseEvent) {
  if (props.disabled) return;
  emit("select", key, event.shiftKey);
}
</script>

<template>
  <UModal v-model:open="open" :title="t('mapo.repeater.chooseBlock')">
    <template #body>
      <div class="space-y-4">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          :placeholder="t('mapo.repeater.searchBlocks')"
          class="w-full"
          autofocus
        />

        <div v-if="categories.length" class="flex flex-wrap gap-1.5">
          <UButton
            size="xs"
            :variant="category === '' ? 'solid' : 'outline'"
            color="neutral"
            :label="t('mapo.repeater.allCategories')"
            @click="category = ''"
          />
          <UButton
            v-for="cat in categories"
            :key="cat"
            size="xs"
            :variant="category === cat ? 'solid' : 'outline'"
            color="neutral"
            :label="cat"
            @click="category = cat"
          />
        </div>

        <div
          v-if="filtered.length"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <button
            v-for="tpl in filtered"
            :key="tpl.key"
            type="button"
            class="group flex flex-col overflow-hidden rounded-lg border border-default text-left transition hover:border-primary hover:shadow focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="disabled"
            :data-template="tpl.key"
            @click="pick(tpl.key, $event)"
          >
            <!-- Preview: image > wireframe > icon -->
            <div
              class="flex h-28 w-full items-center justify-center bg-elevated"
            >
              <img
                v-if="tpl.image"
                :src="tpl.image"
                alt=""
                class="h-full w-full object-cover"
              />
              <div
                v-else-if="tpl.wireframe"
                class="flex w-3/4 flex-col gap-1.5"
                aria-hidden="true"
              >
                <template v-for="(shape, i) in shapesFor(tpl.fields)" :key="i">
                  <div
                    v-if="shape === 'line'"
                    class="h-2 w-full rounded bg-accented"
                  />
                  <div v-else-if="shape === 'lines'" class="space-y-1">
                    <div class="h-1.5 w-full rounded bg-accented" />
                    <div class="h-1.5 w-5/6 rounded bg-accented" />
                  </div>
                  <div
                    v-else-if="shape === 'box'"
                    class="h-8 w-full rounded bg-accented"
                  />
                  <div v-else class="h-2.5 w-2.5 rounded-sm bg-accented" />
                </template>
              </div>
              <UIcon
                v-else
                :name="tpl.icon ?? 'i-lucide-layout-template'"
                class="h-10 w-10 text-dimmed group-hover:text-primary"
              />
            </div>

            <div class="space-y-0.5 p-3">
              <div class="flex items-center gap-1.5">
                <UIcon
                  v-if="tpl.icon && (tpl.image || tpl.wireframe)"
                  :name="tpl.icon"
                  class="h-4 w-4 shrink-0 text-muted"
                />
                <span class="truncate text-sm font-medium text-highlighted">
                  {{ tpl.label }}
                </span>
                <UBadge
                  v-if="tpl.category"
                  size="xs"
                  variant="subtle"
                  color="neutral"
                  class="ml-auto"
                >
                  {{ tpl.category }}
                </UBadge>
              </div>
              <p v-if="tpl.description" class="line-clamp-2 text-xs text-muted">
                {{ tpl.description }}
              </p>
            </div>
          </button>
        </div>
        <p v-else class="py-6 text-center text-sm text-dimmed">
          {{ t("mapo.repeater.noBlocksFound") }}
        </p>

        <p class="text-xs text-dimmed">
          {{ t("mapo.repeater.keepOpenHint") }}
        </p>
      </div>
    </template>
  </UModal>
</template>

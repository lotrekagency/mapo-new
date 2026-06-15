<script setup lang="ts" generic="T extends object">
import { ref, computed, watch } from "vue";
import type { Ref } from "vue";
import type { AnyFieldDescriptor, FieldRegistry } from "@mapomodule/form/types";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useCrud } from "@mapomodule/core/runtime/api/crud";

const props = withDefaults(
  defineProps<{
    open: boolean;
    endpoint?: string;
    itemId?: string | number | null;
    editFields?: AnyFieldDescriptor<T>[];
    lookup?: string;
    languages?: string[];
    registry?: FieldRegistry;
    /**
     * Offline mode: skip backend detail/save calls. The form is seeded from
     * `localItem`, and `saved` emits the locally edited model so the parent
     * can splice it back into its array.
     */
    offline?: boolean;
    /** Seed item for offline mode (clone is taken to avoid mutating parent state). */
    localItem?: T | null;
  }>(),
  {
    endpoint: "",
    lookup: "id",
    editFields: () => [],
    offline: false,
    localItem: null,
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [item: T];
}>();

defineSlots<{
  /**
   * Additional content rendered below the form fields, above the action buttons.
   * Receives `{ model: T }` — the current reactive form model.
   */
  extra(props: { model: T }): any;
}>();

const snack = useSnackStore();
const crud = useCrud<T>(props.endpoint);

// Typed as Ref<T> (not Ref<UnwrapRef<T>>) so the template unwrap stays exactly T,
// which keeps the `extra` slot's `:model` binding type-correct for the generic T.
const model = ref({} as T) as Ref<T>;
const loading = ref(false);
const saving = ref(false);
const isOpen = computed({
  get: () => props.open,
  set: (v) => emit("update:open", v),
});

watch(
  () => [props.open, props.itemId] as const,
  async ([open, id]) => {
    if (!open) return;
    if (id == null) {
      model.value = {} as T;
      return;
    }
    // Offline: seed from the locally-passed item (cloned), no detail() call.
    if (props.offline) {
      model.value = props.localItem
        ? (JSON.parse(JSON.stringify(props.localItem)) as T)
        : ({} as T);
      return;
    }
    loading.value = true;
    try {
      model.value = await crud.detail(id as string | number);
    } catch {
      snack.show("Failed to load item", "error");
      isOpen.value = false;
    } finally {
      loading.value = false;
    }
  },
);

async function save() {
  saving.value = true;
  try {
    // Offline: no backend roundtrip — emit the locally edited model and let
    // the parent splice it back into the source array.
    if (props.offline) {
      snack.show("Saved", "success");
      emit("saved", { ...model.value } as T);
      isOpen.value = false;
      return;
    }
    const result =
      props.itemId != null
        ? await crud.partialUpdate(props.itemId as string | number, model.value)
        : await crud.create(model.value);
    snack.show("Saved", "success");
    emit("saved", result);
    isOpen.value = false;
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })
      ?.response?.data?.detail;
    snack.show(detail ?? "Failed to save", "error");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-highlighted">
            {{ itemId != null ? "Edit" : "New item" }}
          </h3>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            @click="isOpen = false"
          />
        </div>

        <div v-if="loading" class="flex justify-center py-8">
          <UIcon
            name="i-lucide-loader-circle"
            class="h-6 w-6 animate-spin text-muted"
          />
        </div>

        <template v-else>
          <MapoForm
            v-model="model"
            :fields="editFields"
            :languages="languages"
            :registry="registry"
            immediate
          />

          <slot name="extra" :model="model" />

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="isOpen = false">
              Cancel
            </UButton>
            <UButton color="primary" :loading="saving" @click="save">
              Save
            </UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

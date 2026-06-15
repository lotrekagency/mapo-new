<script setup lang="ts" generic="T extends object">
import { ref, computed } from "vue";
import type { ActionDescriptor } from "../types/list.js";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import { useCrud } from "@mapomodule/core/runtime/api/crud";

const props = withDefaults(
  defineProps<{
    actions?: ActionDescriptor<T>[];
    selection: T[] | "all";
    selectionQuery: URLSearchParams;
    endpoint: string;
    lookup?: string;
  }>(),
  {
    actions: () => [],
    lookup: "id",
  },
);

const emit = defineEmits<{ actionCompleted: [] }>();

defineSlots<{
  /** Extra content rendered before the action selector (e.g. custom bulk controls). */
  prepend(): any;
  /** Extra content rendered after the Apply button. */
  append(): any;
}>();

const snack = useSnackStore();
const confirm = useConfirmStore();
const crud = useCrud<T>(props.endpoint);

const isRunning = ref(false);

const defaultActions = computed<ActionDescriptor<T>[]>(() => [
  {
    label: "Delete permanently",
    handler: async ({ selection }) => {
      if (!selection) return;
      await Promise.all(
        selection.map((i) =>
          crud.delete(
            (i as Record<string, unknown>)[props.lookup] as string | number,
          ),
        ),
      );
    },
    permissions: "delete",
    handleMultiple: true,
    handleAll: false,
  },
]);

const allActions = computed(() => [...defaultActions.value, ...props.actions]);

const visibleActions = computed(() =>
  allActions.value.filter((a) =>
    props.selection === "all"
      ? (a.handleAll ?? false)
      : (a.handleMultiple ?? true),
  ),
);

// USelect can only model primitive values, so track the selected action by
// label and resolve the descriptor from the visible list.
const selectedLabel = ref<string | undefined>(undefined);
const selectedAction = computed<ActionDescriptor<T> | null>(
  () =>
    visibleActions.value.find((a) => a.label === selectedLabel.value) ?? null,
);

const applyButtonColor = computed(() =>
  selectedAction.value?.dangerous ? "error" : "primary",
);

function canRun(action: ActionDescriptor<T>): boolean {
  const perms = action.permissions
    ? Array.isArray(action.permissions)
      ? action.permissions
      : [action.permissions]
    : [];
  if (!perms.length) return true;
  const { checkPermission } = usePermissions();
  return perms.every((p) => checkPermission(p));
}

async function runAction() {
  if (!selectedAction.value) return;
  const action = selectedAction.value;

  const ok = await confirm.ask({
    title: action.label,
    message:
      props.selection === "all"
        ? "This action will be applied to all items. Do you want to continue?"
        : `This action will be applied to ${(props.selection as T[]).length} item(s). Do you want to continue?`,
    confirmText: "Confirm",
    dangerous: !!action.dangerous,
  });
  if (!ok) return;

  isRunning.value = true;
  try {
    await action.handler({
      selection: props.selection === "all" ? null : (props.selection as T[]),
      selectionQuery: props.selectionQuery,
      lookup: props.lookup,
    });
    snack.show("Action completed", "success");
    emit("actionCompleted");
    selectedLabel.value = undefined;
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })
      ?.response?.data?.detail;
    snack.show(detail ?? "Action failed", "error");
  } finally {
    isRunning.value = false;
  }
}

const isActive = computed(
  () => props.selection === "all" || (props.selection as T[]).length > 0,
);
</script>

<template>
  <div v-if="isActive" class="mapo-list-actions flex items-center gap-2">
    <slot name="prepend" />
    <USelect
      v-model="selectedLabel"
      :items="visibleActions"
      value-key="label"
      label-key="label"
      placeholder="Bulk actions..."
      size="sm"
      class="min-w-48"
    />
    <UButton
      size="sm"
      :color="applyButtonColor"
      :loading="isRunning"
      :disabled="!selectedAction || !canRun(selectedAction)"
      @click="runAction"
    >
      Apply
    </UButton>
    <slot name="append" />
  </div>
</template>

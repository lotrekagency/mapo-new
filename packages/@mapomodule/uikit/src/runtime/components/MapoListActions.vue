<script setup lang="ts" generic="T extends object">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ActionDescriptor } from "../types/list.js";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import { getErrorDetail } from "@mapomodule/core/runtime/utils/fetchError";

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

const { t } = useI18n();
const snack = useSnackStore();
const confirm = useConfirmStore();
const crud = useCrud<T>(props.endpoint);

const isRunning = ref(false);

const defaultActions = computed<ActionDescriptor<T>[]>(() => [
  {
    label: t("mapo.listActions.permanentDelete"),
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
        ? t("mapo.listActions.confirmBulk")
        : t("mapo.listActions.confirmBulkCount", {
            count: (props.selection as T[]).length,
          }),
    confirmText: t("mapo.confirm"),
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
    snack.show(t("mapo.listActions.actionCompleted"), "success");
    emit("actionCompleted");
    selectedLabel.value = undefined;
  } catch (err: unknown) {
    snack.show(
      getErrorDetail(err) ?? t("mapo.listActions.actionFailed"),
      "error",
    );
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
      :placeholder="t('mapo.listActions.bulkActions')"
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
      {{ t("mapo.apply") }}
    </UButton>
    <slot name="append" />
  </div>
</template>

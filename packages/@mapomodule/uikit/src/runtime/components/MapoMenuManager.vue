<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import {
  getErrorData,
  getErrorDetail,
  getErrorStatus,
} from "@mapomodule/core/runtime/utils/fetchError";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import { deepClone, objectDiff } from "@mapomodule/utils";
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import {
  findMenuNode,
  type MapoMenu,
  type MenuTreeNode,
} from "../types/menu.js";
import MapoMenuTreeview from "./MapoMenuTreeview.vue";
import MapoMenuNodeEditor from "./MapoMenuNodeEditor.vue";

/**
 * Menu Manager shell — split-pane editor for hierarchical navigation menus.
 *
 * Left: drag & drop node tree (`MapoMenuTreeview`).
 * Right: form editor for the selected node (`MapoMenuNodeEditor`).
 *
 * Loads the menu from `endpoint`/`identifier` on mount (v1 parity), keeps
 * per-language node trees when `translatable`, and saves the whole structure
 * with `create`/`update`/`partialUpdate` depending on state and `usePatch`.
 *
 * @example
 * <MapoMenuManager
 *   endpoint="/api/menus"
 *   :identifier="route.params.id"
 *   :languages="['it', 'en']"
 *   :max-depth="5"
 * />
 */
const props = withDefaults(
  defineProps<{
    /** Menu CRUD endpoint (e.g. `/api/menus`). */
    endpoint: string;
    /** Menu id to load, or `"new"` to start from an empty menu. */
    identifier?: string | number;
    /** Menu payload (v-model). Used as the initial model when `identifier` is `"new"`. */
    modelValue?: MapoMenu | null;
    /** Manage one node tree per language under `translations`. */
    translatable?: boolean;
    /** Active editing language (v-model:lang). Defaults to the first of `languages`. */
    lang?: string;
    /** Translation language codes (e.g. `['it', 'en']`). */
    languages?: string[];
    /** Save with `partialUpdate` sending only the changed keys. */
    usePatch?: boolean;
    /** Max nesting depth; `-1` = unlimited. */
    maxDepth?: number;
    /**
     * Django model used for permission gating (`add_<model>` / `change_<model>`).
     * When the user lacks the permission the manager renders read-only.
     */
    permissionModel?: string;
    /** Force read-only mode. */
    readonly?: boolean;
    /** Replaces the node editor's default core fields. */
    coreFields?: AnyFieldDescriptor[] | null;
    /** Extra node editor fields appended after the core ones. */
    additionalFields?: AnyFieldDescriptor[];
    /** CSS classes offered by the node `style` select, as `{ label: cssClass }`. */
    availableClasses?: Record<string, string>;
  }>(),
  {
    identifier: "new",
    modelValue: null,
    translatable: true,
    lang: undefined,
    languages: () => [],
    usePatch: false,
    maxDepth: -1,
    permissionModel: undefined,
    readonly: false,
    coreFields: null,
    additionalFields: () => [],
    availableClasses: () => ({}),
  },
);

const emit = defineEmits<{
  "update:modelValue": [menu: MapoMenu];
  "update:lang": [lang: string];
  /** Emitted after a successful save with the server response. */
  saved: [menu: MapoMenu];
}>();

defineSlots<{
  /** Rendered when no node is selected (right pane placeholder). */
  empty(): unknown;
  /** Content above the node editor form. */
  "editor-form-top"(props: Record<string, unknown>): unknown;
  /** Replaces the node editor form. */
  "editor-form"(props: Record<string, unknown>): unknown;
  /** Content below the node editor form. */
  "editor-form-bottom"(props: Record<string, unknown>): unknown;
}>();

const { t } = useI18n();
const snack = useSnackStore();
const crud = useCrud<MapoMenu>(props.endpoint);

// ─── State ────────────────────────────────────────────────────────────────────

const model = ref<MapoMenu>(
  props.modelValue ?? { key: "", nodes: [], translations: {} },
);
let backup: MapoMenu = deepClone(model.value);

const selected = ref<MenuTreeNode | null>(null);
const currentLang = ref(props.lang ?? props.languages[0] ?? "");
const isLoading = ref(String(props.identifier) !== "new");
const isSaving = ref(false);

const isNew = computed(() => String(props.identifier) === "new");
const translationsActive = computed(
  () => props.translatable && props.languages.length > 0,
);

// ─── Permissions ─────────────────────────────────────────────────────────────

const { canAdd, canChange } = usePermissions();
const effectiveReadonly = computed(() => {
  if (props.readonly) return true;
  if (!props.permissionModel) return false;
  return isNew.value
    ? !canAdd(props.permissionModel)
    : !canChange(props.permissionModel);
});

// ─── Language handling ───────────────────────────────────────────────────────

watch(
  () => props.lang,
  (val) => {
    if (val && props.languages.includes(val)) currentLang.value = val;
  },
);

watch(currentLang, (val) => {
  // Nodes are per-language: the old selection does not exist in the new tree.
  selected.value = null;
  emit("update:lang", val);
});

// ─── Active node tree (translations-aware) ───────────────────────────────────
// The container the active tree lives in is created eagerly by a watcher rather
// than lazily inside the `nodes` computed: the tree is mutated in place by the
// drag & drop lists, so it must be a stable reactive array, and a computed that
// writes to the model on read would be a side effect.

function ensureTree() {
  if (translationsActive.value) {
    model.value.translations ??= {};
    const lang = currentLang.value;
    model.value.translations[lang] ??= { nodes: [] };
    model.value.translations[lang].nodes ??= [];
  } else {
    model.value.nodes ??= [];
  }
}

watch([model, currentLang, translationsActive], ensureTree, {
  immediate: true,
});

const nodes = computed<MenuTreeNode[]>(() => {
  if (translationsActive.value) {
    return model.value.translations?.[currentLang.value]?.nodes ?? [];
  }
  return model.value.nodes ?? [];
});

// ─── Load ────────────────────────────────────────────────────────────────────

watch(
  () => props.modelValue,
  (val) => {
    if (val) model.value = val;
  },
);

watch(model, (val) => emit("update:modelValue", val));

onMounted(async () => {
  if (isNew.value) return;
  isLoading.value = true;
  try {
    model.value = await crud.detail(props.identifier);
    backup = deepClone(model.value);
  } catch (err: unknown) {
    snack.show(getErrorDetail(err) ?? t("mapo.loadItemError"), "error");
  } finally {
    isLoading.value = false;
  }
});

// ─── Save ────────────────────────────────────────────────────────────────────

async function save() {
  if (effectiveReadonly.value) return;
  clearErrors();
  isSaving.value = true;
  try {
    let response: MapoMenu;
    if (!model.value.id) {
      response = await crud.create(model.value);
    } else if (props.usePatch) {
      const diff = objectDiff(backup, model.value) as Partial<MapoMenu>;
      response = await crud.partialUpdate(model.value.id, diff);
    } else {
      response = await crud.update(model.value.id, model.value);
    }
    model.value = response;
    backup = deepClone(response);
    selected.value = null;
    snack.show(
      isNew.value ? t("mapo.createSuccess") : t("mapo.saveSuccess"),
      "success",
    );
    emit("saved", response);
  } catch (err: unknown) {
    const data = getErrorData(err);
    if (getErrorStatus(err) === 400 && data) parseErrors(data);
    snack.show(getErrorDetail(err) ?? t("mapo.genericError"), "error");
  } finally {
    isSaving.value = false;
  }
}

// ─── Backend error mapping ───────────────────────────────────────────────────
// DRF mirrors the payload shape: errors for nested nodes arrive at the same
// position in a nested `nodes` array. Walk both trees in parallel and attach
// the node-level errors; select the first errored node in the active tree.

function clearErrors() {
  const walk = (list: MenuTreeNode[]) => {
    for (const node of list) {
      if (node.errors) delete node.errors;
      walk(node.nodes ?? []);
    }
  };
  if (model.value.nodes) walk(model.value.nodes);
  for (const tr of Object.values(model.value.translations ?? {})) {
    walk(tr.nodes ?? []);
  }
}

function parseErrors(data: Record<string, unknown>) {
  const attach = (
    list: MenuTreeNode[],
    errors: unknown[],
    inActiveTree: boolean,
  ) => {
    errors.forEach((err, i) => {
      const node = list[i];
      if (!node || !err || typeof err !== "object") return;
      const { nodes: childErrors, ...nodeErrors } = err as Record<
        string,
        unknown
      >;
      if (Object.keys(nodeErrors).length > 0) {
        node.errors = nodeErrors as Record<string, string[]>;
        if (inActiveTree && !selected.value) selected.value = node;
      }
      if (Array.isArray(childErrors)) {
        attach(node.nodes ?? [], childErrors, inActiveTree);
      }
    });
  };

  if (translationsActive.value) {
    const translations = data.translations as
      | Record<string, { nodes?: unknown[] }>
      | undefined;
    for (const [lang, trErrors] of Object.entries(translations ?? {})) {
      const tree = model.value.translations?.[lang]?.nodes ?? [];
      if (Array.isArray(trErrors?.nodes)) {
        attach(tree, trErrors.nodes, lang === currentLang.value);
      }
    }
  } else if (Array.isArray(data.nodes)) {
    attach(model.value.nodes ?? [], data.nodes, true);
  }
}

// ─── Editor errors for the lang switch ───────────────────────────────────────
// MapoDetailLangSwitch highlights languages whose keys start with
// `translations.<lang>.` — build that map from the per-node errors.

const langErrors = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {};
  const hasErrors = (list: MenuTreeNode[]): boolean =>
    list.some(
      (n) =>
        (n.errors && Object.keys(n.errors).length > 0) ||
        hasErrors(n.nodes ?? []),
    );
  for (const [lang, tr] of Object.entries(model.value.translations ?? {})) {
    if (hasErrors(tr.nodes ?? [])) {
      map[`translations.${lang}.nodes`] = [t("mapo.fixErrors")];
    }
  }
  return map;
});

const treeview = ref<InstanceType<typeof MapoMenuTreeview> | null>(null);
</script>

<template>
  <div class="mapo-menu-manager flex h-full min-h-0 overflow-hidden">
    <!-- Left pane: tree -->
    <div class="flex w-72 shrink-0 flex-col border-r border-default bg-default">
      <MapoMenuTreeview
        ref="treeview"
        v-model="selected"
        :nodes="nodes"
        :title="`${t('mapo.menuManager.menu')}: ${model.key || '—'}`"
        :max-depth="maxDepth"
        :readonly="effectiveReadonly"
        :loading="isLoading"
      >
        <template v-if="translationsActive" #top>
          <div class="border-b border-default px-2 pt-2">
            <MapoDetailLangSwitch
              v-model="currentLang"
              :langs="languages"
              :errors="langErrors"
              no-route-change
            />
          </div>
        </template>
        <template #bottom>
          <div class="border-t border-default p-2">
            <UButton
              v-if="!effectiveReadonly"
              block
              icon="i-lucide-save"
              :loading="isSaving"
              @click="save"
            >
              {{ t("mapo.save") }}
            </UButton>
          </div>
        </template>
      </MapoMenuTreeview>
    </div>

    <!-- Right pane -->
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <UIcon
        name="i-lucide-loader-circle"
        class="size-8 animate-spin text-muted"
      />
    </div>

    <MapoMenuNodeEditor
      v-else-if="selected"
      :model-value="selected"
      :nodes="nodes"
      :menu-endpoint="endpoint"
      :core-fields="coreFields"
      :additional-fields="additionalFields"
      :available-classes="availableClasses"
      :readonly="effectiveReadonly"
      @update:model-value="
        selected = findMenuNode(nodes, $event.id)?.node ?? $event
      "
      @delete="treeview?.deleteSelectedNode()"
    >
      <template #form-top="slotProps">
        <slot name="editor-form-top" v-bind="slotProps" />
      </template>
      <template v-if="$slots['editor-form']" #form="slotProps">
        <slot name="editor-form" v-bind="slotProps" />
      </template>
      <template #form-bottom="slotProps">
        <slot name="editor-form-bottom" v-bind="slotProps" />
      </template>
    </MapoMenuNodeEditor>

    <!-- Empty state -->
    <div
      v-else
      class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <slot name="empty">
        <UIcon name="i-lucide-network" class="size-12 text-dimmed" />
        <p class="max-w-xs text-sm text-muted">
          {{ t("mapo.menuManager.noSelectedNode") }}
        </p>
      </slot>
    </div>
  </div>
</template>

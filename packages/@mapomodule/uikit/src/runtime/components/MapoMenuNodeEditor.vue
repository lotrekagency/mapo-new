<script setup lang="ts">
import { ref, computed, watch, resolveComponent } from "vue";
import { useI18n } from "vue-i18n";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import { findMenuNode, type MenuTreeNode } from "../types/menu.js";

/**
 * Right pane of `MapoMenuManager`: edits the selected node with a `MapoForm`.
 *
 * The default field set matches v1/Camomilla (title, link type, style,
 * new-tab flag, relational page picker, static URL). Consumers can replace it
 * entirely (`core-fields`) or append their own (`additional-fields`).
 */
const props = withDefaults(
  defineProps<{
    /** Selected node (v-model). Mutated in place — the tree owns the data. */
    modelValue: MenuTreeNode;
    /** Full node tree, used to compute the breadcrumb trail. */
    nodes?: MenuTreeNode[];
    /** Menu CRUD endpoint; `<endpoint>/page_types` feeds the relational picker. */
    menuEndpoint?: string;
    /** Replaces the default core field set entirely. */
    coreFields?: AnyFieldDescriptor[] | null;
    /** Extra fields appended after the core ones. */
    additionalFields?: AnyFieldDescriptor[];
    /** CSS classes offered by the `style` select, as `{ label: cssClass }`. */
    availableClasses?: Record<string, string>;
    readonly?: boolean;
  }>(),
  {
    nodes: () => [],
    menuEndpoint: "",
    coreFields: null,
    additionalFields: () => [],
    availableClasses: () => ({}),
    readonly: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [node: MenuTreeNode];
  /** Delete-node button pressed. */
  delete: [];
}>();

defineSlots<{
  /** Content above the form. Receives the slot bindings. */
  "form-top"(props: SlotBindings): unknown;
  /** Replaces the whole form. Receives the slot bindings. */
  form(props: SlotBindings): unknown;
  /** Content below the form. Receives the slot bindings. */
  "form-bottom"(props: SlotBindings): unknown;
}>();

interface SlotBindings {
  model: MenuTreeNode;
  fields: AnyFieldDescriptor[];
  errors: Record<string, string[]>;
  readonly: boolean;
}

const { t } = useI18n();

// ─── Relational page picker ──────────────────────────────────────────────────
// `<menuEndpoint>/page_types` lists the content types; its detail returns the
// routable pages of that type (Camomilla contract, v1 parity).

const pageTypesEndpoint = computed(
  () => `${props.menuEndpoint.replace(/\/$/, "")}/page_types`,
);

interface AvailablePage {
  name: string;
  url_node_id: number | string;
}

const availablePages = ref<AvailablePage[]>([]);

async function loadPages() {
  const contentType = props.modelValue?.link?.content_type;
  if (!contentType || !props.menuEndpoint) {
    availablePages.value = [];
    return;
  }
  try {
    const crud = useCrud<AvailablePage[]>(pageTypesEndpoint.value);
    const id =
      typeof contentType === "object"
        ? ((contentType as { id?: number | string }).id ?? "")
        : contentType;
    availablePages.value = (await crud.detail(
      id,
    )) as unknown as AvailablePage[];
  } catch {
    availablePages.value = [];
  }
}

watch(() => props.modelValue?.id, loadPages, { immediate: true });

// ─── Fields ──────────────────────────────────────────────────────────────────

const defaultCoreFields = computed<AnyFieldDescriptor[]>(() => [
  {
    key: "title",
    label: t("mapo.menuNodeEditor.title"),
    type: "text",
    required: true,
  },
  {
    key: "link.link_type",
    label: t("mapo.menuNodeEditor.linkTypeLabel"),
    type: "select",
    cols: { md: 4 },
    attrs: {
      items: [
        { label: t("mapo.menuNodeEditor.relational"), value: "RE" },
        { label: t("mapo.menuNodeEditor.static"), value: "ST" },
      ],
    },
  },
  ...(Object.keys(props.availableClasses).length
    ? [
        {
          key: "meta.style",
          label: t("mapo.menuNodeEditor.styleLabel"),
          type: "select",
          cols: { md: 4 },
          attrs: {
            items: Object.entries(props.availableClasses).map(
              ([label, value]) => ({ label, value }),
            ),
          },
        } as AnyFieldDescriptor,
      ]
    : []),
  {
    // `target_bank` keeps the v1/Camomilla meta key for data compatibility.
    key: "meta.target_bank",
    label: t("mapo.menuNodeEditor.openInNewTabLabel"),
    type: "switch",
    cols: { md: 4 },
  },
  {
    key: "link.content_type",
    label: t("mapo.menuNodeEditor.relContentTypeLabel"),
    type: "fks",
    cols: { md: 6 },
    show: ({ model }) => (model as MenuTreeNode).link?.link_type === "RE",
    onChange: () => loadPages(),
    attrs: {
      endpoint: pageTypesEndpoint.value,
      itemText: "verbose_name_plural",
      itemValue: "id",
      returnObject: false,
      multiple: false,
    },
  },
  {
    key: "link.url_node",
    label: t("mapo.menuNodeEditor.relPageIdLabel"),
    type: "select",
    cols: { md: 6 },
    show: ({ model }) => (model as MenuTreeNode).link?.link_type === "RE",
    attrs: {
      items: availablePages.value.map((p) => ({
        label: p.name,
        value: p.url_node_id,
      })),
    },
  },
  {
    key: "link.static",
    label: t("mapo.menuNodeEditor.staticLabel"),
    type: "text",
    show: ({ model }) => (model as MenuTreeNode).link?.link_type === "ST",
  },
]);

const fields = computed<AnyFieldDescriptor[]>(() => [
  ...(props.coreFields ?? defaultCoreFields.value),
  ...props.additionalFields,
]);

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

const breadcrumbs = computed<MenuTreeNode[]>(() => {
  const found = findMenuNode(props.nodes, props.modelValue.id);
  return found ? [...found.parents, found.node] : [props.modelValue];
});

// ─── Errors ──────────────────────────────────────────────────────────────────
// Node errors arrive nested from the backend ({ title: [...], link: {...} });
// MapoForm expects a flat dot-notation Record<string, string[]>.

const errors = computed<Record<string, string[]>>(() => {
  const flat: Record<string, string[]> = {};
  const walk = (obj: unknown, prefix: string) => {
    if (Array.isArray(obj)) {
      flat[prefix] = obj.map(String);
    } else if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        walk(v, prefix ? `${prefix}.${k}` : k);
      }
    }
  };
  walk(props.modelValue?.errors ?? {}, "");
  return flat;
});

const slotBindings = computed<SlotBindings>(() => ({
  model: props.modelValue,
  fields: fields.value,
  errors: errors.value,
  readonly: props.readonly,
}));

// MapoForm is globally registered by @mapomodule/form.
const MapoForm = resolveComponent("MapoForm");
</script>

<template>
  <div class="mapo-menu-node-editor flex h-full min-w-0 flex-1 flex-col">
    <!-- Top bar: breadcrumbs + delete -->
    <div
      class="flex items-center justify-between gap-2 border-b border-default px-4 py-2"
    >
      <p class="flex min-w-0 items-center gap-1 truncate text-sm">
        <span class="shrink-0 text-dimmed"
          >{{ t("mapo.menuNodeEditor.editNode") }}:</span
        >
        <template v-for="(node, i) in breadcrumbs" :key="node.id">
          <button
            type="button"
            class="max-w-40 truncate hover:underline"
            :class="
              i === breadcrumbs.length - 1
                ? 'font-medium text-highlighted'
                : 'text-muted'
            "
            @click="emit('update:modelValue', node)"
          >
            {{ node.title || "…" }}
          </button>
          <UIcon
            v-if="i !== breadcrumbs.length - 1"
            name="i-lucide-chevron-right"
            class="size-3 shrink-0 text-dimmed"
          />
        </template>
      </p>
      <UButton
        v-if="!readonly"
        icon="i-lucide-trash-2"
        size="xs"
        color="error"
        variant="soft"
        @click="emit('delete')"
      >
        {{ t("mapo.delete") }}
      </UButton>
    </div>

    <!-- Form -->
    <div class="flex-1 overflow-y-auto p-4">
      <slot name="form-top" v-bind="slotBindings" />
      <slot name="form" v-bind="slotBindings">
        <component
          :is="MapoForm"
          :model-value="modelValue"
          :fields="fields"
          :errors="errors"
          :readonly="readonly"
          immediate
          @update:model-value="emit('update:modelValue', $event)"
        />
      </slot>
      <slot name="form-bottom" v-bind="slotBindings" />
    </div>
  </div>
</template>

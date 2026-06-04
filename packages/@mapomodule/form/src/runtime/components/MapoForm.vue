<script setup lang="ts" generic="T extends object">
import { computed, useSlots, watchEffect, inject, onUnmounted } from "vue";
import type { Ref } from "vue";
import { useNuxtApp } from "#app";
import type { FieldDescriptor, FieldRegistry } from "../types/index.js";
import type { GroupEntry, TabEntry } from "../types/layout.js";
import { useMapoForm, injectMapoForm } from "../composables/useMapoForm.js";
import { provideCurrentLang } from "../composables/useCurrentLang.js";
import MapoFormGroup from "./MapoFormGroup.vue";
import MapoFormTabs from "./MapoFormTabs.vue";
import MapoFormFlatSection from "./MapoFormFlatSection.vue";

const props = withDefaults(
  defineProps<{
    modelValue: T;
    fields: FieldDescriptor<T>[];
    errors?: Record<string, string[]>;
    languages?: string[];
    currentLang?: string;
    readonly?: boolean;
    immediate?: boolean;
    /**
     * Field component registry. When omitted, it is auto-injected from
     * `$mapoFormRegistry` (provided by the `@mapomodule/form` plugin).
     * Pass it explicitly only for headless forms or one-off registry swaps.
     */
    registry?: FieldRegistry;
  }>(),
  {
    errors: () => ({}),
    languages: () => [],
    currentLang: "",
    readonly: false,
    immediate: false,
    registry: undefined,
  },
);

// Auto-inject the registry from the global plugin to remove the boilerplate
// `useNuxtApp().$mapoFormRegistry` + `:registry=…` from every page.
const injectedRegistry = computed<FieldRegistry>(() => {
  if (props.registry) return props.registry;
  const nuxt = useNuxtApp() as unknown as { $mapoFormRegistry?: FieldRegistry };
  if (!nuxt.$mapoFormRegistry) {
    throw new Error(
      "[MapoForm] No registry available: pass the `registry` prop or " +
        "make sure the @mapomodule/form module is installed.",
    );
  }
  return nuxt.$mapoFormRegistry;
});

const emit = defineEmits<{ "update:modelValue": [value: T] }>();

// Slots are forwarded generically to inner layers; props vary per slot
// (field.* carry a descriptor, group.* carry none), so they are loosely typed.
defineSlots<Record<string, (props?: Record<string, unknown>) => unknown>>();

// ─── Setup form ──────────────────────────────────────────────────────────────

const model = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const currentLangRef = computed(() => props.currentLang);
const errorsRef = computed(() => props.errors);

const globalDebounce: number =
  // @ts-expect-error — typed by module augmentation at app build time
  useRuntimeConfig().public.mapoForm?.debounce ?? 300;

const form = useMapoForm({
  model: model as unknown as Ref<T>,
  fields: computed(() => props.fields),
  errors: errorsRef,
  languages: props.languages,
  currentLang: currentLangRef,
  immediate: props.immediate,
  debounce: globalDebounce,
  registry: injectedRegistry.value,
});

// Inherit the parent form's submitted state (provided automatically by useMapoForm)
// so that form.submit() on the parent also shows errors in this nested MapoForm.
const parentCtx = injectMapoForm();
watchEffect(() => {
  form.readonly.value = props.readonly;
  if (parentCtx) form.ctx.submitted.value = parentCtx.submitted.value;
});

defineExpose({
  submit: form.submit,
  validateClient: form.validateClient,
  resetDirty: form.resetDirty,
  getPatch: form.getPatch,
  isDirty: form.isDirty,
  isLoading: form.isLoading,
});

type ValidateClientFn = () => {
  valid: boolean;
  errors: Record<string, string>;
};
type RegisterFn = (fn: ValidateClientFn) => () => void;
const registerValidator = inject<RegisterFn | null>(
  "mapoDetailRegisterValidator",
  null,
);
if (registerValidator) {
  const unregister = registerValidator(form.validateClient);
  onUnmounted(unregister);
}

// Forward only field-specific slots to inner layers, avoiding host-level slots
// such as header/footer/actions where they have no meaning.
const slots = useSlots();
const fieldSlotNames = computed(() =>
  Object.keys(slots).filter(
    (name) =>
      name.startsWith("field.") ||
      name.startsWith("group.") ||
      name.startsWith("tab.") ||
      name === "tab-bar-end",
  ),
);
provideCurrentLang(currentLangRef);

// ─── Group fields by tab/group ───────────────────────────────────────────────

function getOrCreateTab(map: Map<string, TabEntry>, name: string): TabEntry {
  if (!map.has(name)) {
    map.set(name, { name, groups: new Map(), children: new Map() });
  }
  return map.get(name)!;
}

const grouped = computed<Map<string, TabEntry>>(() => {
  const tabs = new Map<string, TabEntry>();

  // The layout tree is type-agnostic: cast the generic descriptors to the bare
  // FieldDescriptor used by the (non-generic) MapoFormGroup/Tabs/FlatSection layers.
  for (const field of props.fields as FieldDescriptor[]) {
    // Normalise: 'a/b', ['a','b'], or 'a' all become a string[]
    const rawTab = field.tab;
    const tabPath: string[] = !rawTab
      ? ["__default__"]
      : Array.isArray(rawTab)
        ? rawTab
        : rawTab.split("/");
    const groupName = field.group ?? "__flat__";

    // Walk/create the nested TabEntry tree
    let currentMap = tabs;
    for (let i = 0; i < tabPath.length - 1; i++) {
      const parent = getOrCreateTab(currentMap, tabPath[i]);
      currentMap = parent.children;
    }
    const leaf = getOrCreateTab(currentMap, tabPath[tabPath.length - 1]);
    if (!leaf.groups.has(groupName)) {
      leaf.groups.set(groupName, { fields: [], subtabs: new Map() });
    }
    const grp = leaf.groups.get(groupName)!;
    if (field.subtab) {
      if (!grp.subtabs.has(field.subtab)) {
        grp.subtabs.set(field.subtab, []);
      }
      grp.subtabs.get(field.subtab)!.push(field);
    } else {
      grp.fields.push(field);
    }
  }

  return tabs;
});

const hasTabs = computed(() => {
  const keys = [...grouped.value.keys()];
  return keys.length > 1 || (keys.length === 1 && keys[0] !== "__default__");
});

const defaultGroups = computed(
  () =>
    grouped.value.get("__default__")?.groups ?? new Map<string, GroupEntry>(),
);

const tabList = computed<TabEntry[]>(() => [...grouped.value.values()]);
</script>

<template>
  <div class="mapo-form space-y-5">
    <!-- All field slots (field.<key>, field.<key>.append, .prepend, .label, …)
         are forwarded generically to inner layers (Tabs → Group → Field). -->
    <MapoFormTabs v-if="hasTabs" :tabs="tabList">
      <template
        v-for="slotName in fieldSlotNames"
        :key="slotName"
        #[slotName]="slotProps"
      >
        <slot :name="slotName" v-bind="slotProps ?? {}" />
      </template>
    </MapoFormTabs>

    <template v-else>
      <template v-for="[groupName, group] of defaultGroups" :key="groupName">
        <template v-if="groupName !== '__flat__'">
          <slot :name="`group.${groupName}.before`" />
          <MapoFormGroup
            :name="groupName"
            :fields="group.fields"
            :subtabs="group.subtabs"
          >
            <template
              v-for="slotName in fieldSlotNames"
              :key="slotName"
              #[slotName]="slotProps"
            >
              <slot :name="slotName" v-bind="slotProps ?? {}" />
            </template>
          </MapoFormGroup>
          <slot :name="`group.${groupName}.after`" />
        </template>

        <MapoFormFlatSection v-else :fields="group.fields as FieldDescriptor[]">
          <template
            v-for="slotName in fieldSlotNames"
            :key="slotName"
            #[slotName]="slotProps"
          >
            <slot :name="slotName" v-bind="slotProps ?? {}" />
          </template>
        </MapoFormFlatSection>
      </template>
    </template>
  </div>
</template>

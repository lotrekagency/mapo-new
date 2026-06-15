<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    langs: string[];
    errors?: Record<string, string[]>;
    noRouteChange?: boolean;
    /**
     * Number of languages above which the select also shows a dropdown
     * alongside the tab bar (for quick navigation). Default: `8`.
     */
    langThreshold?: number;
  }>(),
  {
    errors: () => ({}),
    noRouteChange: false,
    langThreshold: 8,
  },
);

const emit = defineEmits<{ (e: "update:modelValue", lang: string): void }>();

const route = useRoute();
const router = useRouter();

// ─── Tab refs for scrollIntoView ─────────────────────────────────────────────

const tabRefs = ref<Record<string, HTMLElement | null>>({});

function setTabRef(lang: string, el: Element | null) {
  tabRefs.value[lang] = el as HTMLElement | null;
}

function scrollActiveIntoView(lang: string) {
  nextTick(() => {
    tabRefs.value[lang]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasErrors(lang: string): boolean {
  const prefix = `translations.${lang}.`;
  return Object.keys(props.errors || {}).some((k) => k.startsWith(prefix));
}

function selectLang(lang: string) {
  emit("update:modelValue", lang);
  if (!props.noRouteChange && route.query.lang !== lang) {
    router.replace({ query: { ...route.query, lang } });
  }
  scrollActiveIntoView(lang);
}

function onSelectChange(v: unknown) {
  const lang =
    typeof v === "object" && v !== null
      ? (v as { value: string }).value
      : (v as string);
  if (lang) selectLang(lang);
}

// ─── Select menu items ────────────────────────────────────────────────────────

const selectItems = computed(() =>
  props.langs.map((lang) => ({
    label: lang.toUpperCase(),
    value: lang,
    trailingIcon: hasErrors(lang) ? "i-lucide-alert-circle" : undefined,
  })),
);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  const queryLang = route.query.lang as string | undefined;
  if (
    queryLang &&
    props.langs.includes(queryLang) &&
    queryLang !== props.modelValue
  ) {
    emit("update:modelValue", queryLang);
  }
  scrollActiveIntoView(props.modelValue);
});

watch(
  () => props.modelValue,
  (val) => {
    if (!props.noRouteChange && route.query.lang !== val) {
      router.replace({ query: { ...route.query, lang: val } });
    }
    scrollActiveIntoView(val);
  },
);
</script>

<template>
  <div
    class="flex items-end gap-0 border-b border-gray-200 dark:border-gray-700 mt-2 mb-4"
  >
    <!-- Language select — always visible, aligned at bottom of row -->
    <USelectMenu
      :model-value="modelValue"
      :items="selectItems"
      value-key="value"
      label-key="label"
      size="sm"
      class="w-28 shrink-0 mb-px"
      @update:model-value="onSelectChange"
    >
      <template #default="{ open }">
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :trailing-icon="
            open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
          "
          class="w-full justify-between font-medium"
        >
          <span class="flex items-center gap-1">
            <span
              v-if="hasErrors(modelValue)"
              class="inline-block h-2 w-2 rounded-full bg-red-500"
            />
            {{ modelValue.toUpperCase() }}
          </span>
        </UButton>
      </template>
    </USelectMenu>

    <!-- Divider -->
    <div class="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-2 shrink-0" />

    <!-- Tab bar — always shown, scrollable -->
    <div class="flex gap-1 overflow-x-auto scrollbar-none flex-1">
      <button
        v-for="lang in langs"
        :key="lang"
        :ref="(el) => setTabRef(lang, el as Element | null)"
        type="button"
        class="relative shrink-0 px-4 py-2 text-sm font-medium transition-colors focus:outline-none"
        :class="[
          lang === modelValue
            ? 'text-primary-600 border-b-2 border-primary-600 -mb-px'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
        ]"
        @click="selectLang(lang)"
      >
        {{ lang.toUpperCase() }}
        <span
          v-if="hasErrors(lang)"
          class="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500"
        />
      </button>
    </div>
  </div>
</template>

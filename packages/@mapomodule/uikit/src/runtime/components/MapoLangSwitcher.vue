<script setup lang="ts">
import { computed } from "vue";
import type { Ref } from "vue";
import { useI18n } from "vue-i18n";

/**
 * UI locale switcher — lists the locales configured in `@nuxtjs/i18n`
 * (via `@mapomodule/i18n`) and switches the interface language with
 * cookie persistence. Port of the v1 `LangSwitcher`.
 */
const props = withDefaults(
  defineProps<{
    /** Show the flag emoji derived from the locale `language` tag. */
    flags?: boolean;
    /** Nuxt UI USelectMenu `size` prop. */
    size?: "xs" | "sm" | "md" | "lg" | "xl";
  }>(),
  { flags: true, size: "sm" },
);

interface SwitcherLocale {
  code: string;
  name?: string;
  language?: string;
}

// `locales` and `setLocale` are @nuxtjs/i18n Composer extensions; the uikit
// package only depends on vue-i18n types, so they are typed structurally.
const { locale, locales, setLocale } = useI18n() as unknown as {
  locale: Ref<string>;
  locales: Ref<SwitcherLocale[]>;
  setLocale: (code: string) => Promise<void>;
};

/** Regional-indicator flag emoji from a BCP-47 tag (e.g. `en-US` → 🇺🇸). */
function getFlag(language?: string): string {
  const region = language?.split("-").at(-1);
  if (!region || region.length !== 2 || !/^[A-Za-z]+$/.test(region)) return "";
  const codePoints = region
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const items = computed(() =>
  locales.value.map((l) => ({
    label:
      props.flags && getFlag(l.language)
        ? `${getFlag(l.language)} ${l.name ?? l.code.toUpperCase()}`
        : (l.name ?? l.code.toUpperCase()),
    value: l.code,
  })),
);

const current = computed({
  get: () => locale.value,
  set: (code: string) => {
    if (code && code !== locale.value) setLocale(code);
  },
});
</script>

<template>
  <USelectMenu
    v-model="current"
    :items="items"
    value-key="value"
    label-key="label"
    :size="size"
    :search-input="false"
    class="w-40"
  />
</template>

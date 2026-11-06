<script setup lang="ts">
/**
 * Picks the user or the group of an assignment: searched in the backend's
 * endpoint the app sets (`settings.usersApi`, `settings.groupsApi`), with
 * `?search=`, or written by hand without one: a user's id, a group's name.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import { principalsOf } from "../shared/settings";
import type { MapoAiPrincipal } from "../shared/settings";

const props = defineProps<{
  /** Whether a user or a group is picked. */
  kind: "user" | "group";
  /** Locks the choice, as when an assignment is edited. */
  disabled?: boolean;
}>();

/** The user or the group picked. */
const picked = defineModel<MapoAiPrincipal | undefined>();

const client = useSettingsClient();
const { t } = client;
const endpoint = computed(() =>
  props.kind === "user" ? client.endpoints.users : client.endpoints.groups,
);

const items = shallowRef<MapoAiPrincipal[]>([]);
const searchTerm = shallowRef("");
const searching = shallowRef(false);
const failure = shallowRef<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let asked = 0;

/** Searches the backend, a moment after the admin stops typing. */
watch(
  [searchTerm, endpoint],
  ([term, url]) => {
    if (!url) return;
    clearTimeout(timer);
    timer = setTimeout(() => search(url, term), 250);
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(timer));

async function search(url: string, term: string) {
  const call = ++asked;
  searching.value = true;
  try {
    const answer = await client.call<unknown>(url, {
      query: term.trim() ? { search: term.trim() } : {},
    });
    if (call !== asked) return;
    items.value = principalsOf(answer, props.kind);
    failure.value = undefined;
  } catch (error) {
    if (call === asked) failure.value = client.failureOf(error);
  } finally {
    if (call === asked) searching.value = false;
  }
}

/** The list shown: what the search found, and the current choice. */
const options = computed(() => {
  const current = picked.value;
  const found = items.value;
  return current && !found.some((one) => one.value === current.value)
    ? [current, ...found]
    : found;
});

/** The value written by hand, without an endpoint. */
const written = computed({
  get: () => picked.value?.value ?? "",
  set: (text: string) => {
    const value = text.trim();
    picked.value = value ? { value, label: value } : undefined;
  },
});

const placeholder = computed(() =>
  t(
    endpoint.value
      ? `mapo.ai.settings.principal.search.${props.kind}`
      : `mapo.ai.settings.principal.write.${props.kind}`,
  ),
);
</script>

<template>
  <div class="space-y-1">
    <USelectMenu
      v-if="endpoint"
      v-model="picked"
      v-model:search-term="searchTerm"
      :items="options"
      label-key="label"
      by="value"
      ignore-filter
      :loading="searching"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="w-full"
    />
    <UInput
      v-else
      v-model="written"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="w-full"
    />
    <p v-if="failure" class="text-xs text-error">{{ failure }}</p>
  </div>
</template>

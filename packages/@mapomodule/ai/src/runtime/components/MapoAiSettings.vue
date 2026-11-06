<script setup lang="ts">
/**
 * The AI settings: each user picks the provider and model they prefer,
 * sees the key their calls use, saves their own token where an admin
 * allows it and checks the connection; the AI's admins also assign keys,
 * order the groups and remove the users' tokens, and change how the AI
 * works in the whole app: instructions, rules of verification, words of
 * secrets, the providers' cache, fallbacks and added models. It asks the gateway's
 * `status`, so a user the app keeps out of the AI is told so.
 */
import { onMounted, shallowRef } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type { MapoAiStatus } from "../shared/gateway";
import MapoAiSettingsBehaviour from "./MapoAiSettingsBehaviour.vue";
import MapoAiSettingsKeys from "./MapoAiSettingsKeys.vue";
import MapoAiSettingsPersonal from "./MapoAiSettingsPersonal.vue";

const client = useSettingsClient();
const { t } = client;
const status = shallowRef<MapoAiStatus>();
const failure = shallowRef<string>();
const loading = shallowRef(true);

/** Asks `status` again: after a change, what the user gets may change too. */
async function load(): Promise<void> {
  loading.value = true;
  try {
    status.value = await client.call<MapoAiStatus>("/_mapo/ai/status");
    failure.value = undefined;
  } catch (error) {
    failure.value = client.failureOf(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6 p-4">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t("mapo.ai.settings.title") }}
      </h1>
      <p class="text-sm text-muted">{{ t("mapo.ai.settings.intro") }}</p>
    </header>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="failure"
    />
    <UAlert
      v-else-if="status && !status.allowed"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="t('mapo.ai.settings.notAllowed')"
    />
    <template v-else-if="status">
      <MapoAiSettingsPersonal :status="status" @changed="load" />
      <MapoAiSettingsKeys v-if="status.admin" @changed="load" />
      <MapoAiSettingsBehaviour v-if="status.admin" @changed="load" />
    </template>
    <p v-else-if="loading" class="text-sm text-muted">
      {{ t("mapo.ai.settings.loading") }}
    </p>
  </div>
</template>

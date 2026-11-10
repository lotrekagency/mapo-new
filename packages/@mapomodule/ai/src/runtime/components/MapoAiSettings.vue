<script setup lang="ts">
/**
 * The AI settings: each user picks the provider and model they prefer,
 * sees the key their calls use, saves their own token where an admin
 * allows it and checks the connection; the AI's admins also assign keys,
 * order the groups and remove the users' tokens, and change how the AI
 * works in the whole app: instructions, rules of verification, words of
 * secrets, the providers' cache, fallbacks and added models. Each user
 * sees their own usage, the admins everyone's and the log of the changes. It asks the gateway's
 * `status`, so a user the app keeps out of the AI is told so.
 */
import { onMounted, shallowRef } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type { MapoAiStatus } from "../shared/gateway";
import { readMapoAiStatus } from "../shared/magicFill";
import MapoAiSettingsActions from "./MapoAiSettingsActions.vue";
import MapoAiSettingsBehaviour from "./MapoAiSettingsBehaviour.vue";
import MapoAiSettingsKeys from "./MapoAiSettingsKeys.vue";
import MapoAiSettingsPersonal from "./MapoAiSettingsPersonal.vue";
import MapoAiSettingsUsage from "./MapoAiSettingsUsage.vue";

const client = useSettingsClient();
const { t } = client;
const status = shallowRef<MapoAiStatus>();
const failure = shallowRef<string>();
const loading = shallowRef(true);

/**
 * Asks `status` again: after a change, what the user gets may change too.
 * The answer is outside data, read as Magic Fill reads it: one that cannot
 * be read fails like a request that fails.
 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const read = readMapoAiStatus(
      await client.call<unknown>("/_mapo/ai/status"),
    );
    if (!read) {
      failure.value = t("mapo.ai.errors.badAnswer");
      return;
    }
    status.value = read;
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
      <MapoAiSettingsUsage v-if="!status.admin" scope="mine" />
      <template v-if="status.admin">
        <MapoAiSettingsKeys @changed="load" />
        <MapoAiSettingsBehaviour @changed="load" />
        <MapoAiSettingsUsage scope="all" />
        <MapoAiSettingsActions />
      </template>
    </template>
    <p v-else-if="loading" class="text-sm text-muted">
      {{ t("mapo.ai.settings.loading") }}
    </p>
  </div>
</template>

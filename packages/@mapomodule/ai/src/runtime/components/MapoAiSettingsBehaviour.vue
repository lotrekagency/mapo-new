<script setup lang="ts">
/**
 * The admins' part of the AI settings about how the AI works in the whole
 * app: their instructions, the rules of verification, the words that name
 * a secret and each provider's settings, block by block. Each block saves
 * its own part (`PUT /_mapo/ai/settings`), and the gateway answers the
 * settings again; the gateway checks every change, the page decides
 * nothing.
 */
import { computed, onMounted, shallowRef } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
} from "../shared/gateway";
import { isRecord } from "../shared/guards";
import MapoAiSettingsInstructions from "./MapoAiSettingsInstructions.vue";
import MapoAiSettingsProviders from "./MapoAiSettingsProviders.vue";
import MapoAiSettingsRules from "./MapoAiSettingsRules.vue";
import MapoAiSettingsSecrets from "./MapoAiSettingsSecrets.vue";

const emit = defineEmits<{
  /** The settings changed: the models the admin gets may change too. */
  changed: [];
}>();

const client = useSettingsClient();
const { t } = client;
const settings = shallowRef<MapoAiSettingsAnswer>();
const failure = shallowRef<string>();

const updatedText = computed(() => {
  const updated = settings.value?.updated;
  if (!updated) return "";
  return t("mapo.ai.settings.behaviour.updated", {
    by: updated.by.username ?? updated.by.id,
    at: new Date(updated.at).toLocaleString(),
  });
});

async function load(): Promise<void> {
  try {
    settings.value =
      await client.call<MapoAiSettingsAnswer>("/_mapo/ai/settings");
    failure.value = undefined;
  } catch (error) {
    failure.value = client.failureOf(error);
  }
}

/**
 * Saves one block of the settings.
 * @returns why it failed, for people; nothing once saved
 */
async function save(change: MapoAiSettingsInput): Promise<string | undefined> {
  try {
    settings.value = await client.call<MapoAiSettingsAnswer>(
      "/_mapo/ai/settings",
      { method: "PUT", body: change },
    );
    emit("changed");
    return undefined;
  } catch (error) {
    return failureWithModel(error);
  }
}

/** A refusal for a model the provider does not list names the model. */
function failureWithModel(error: unknown): string {
  const message = client.failureOf(error);
  const body = isRecord(error) ? error.data : undefined;
  const data = isRecord(body) ? body.data : undefined;
  const model = isRecord(data) ? data.model : undefined;
  return typeof model === "string" ? `${message}: ${model}` : message;
}

onMounted(load);
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold text-highlighted">
        {{ t("mapo.ai.settings.behaviour.title") }}
      </h2>
      <p class="text-sm text-muted">
        {{ t("mapo.ai.settings.behaviour.intro") }}
      </p>
      <p v-if="updatedText" class="mt-1 text-xs text-muted">
        {{ updatedText }}
      </p>
    </template>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="failure"
    />
    <div v-else-if="settings" class="space-y-8">
      <MapoAiSettingsInstructions :settings="settings" :save="save" />
      <MapoAiSettingsRules :settings="settings" :save="save" />
      <MapoAiSettingsSecrets :settings="settings" :save="save" />
      <MapoAiSettingsProviders
        v-if="settings.providers.length"
        :settings="settings"
        :save="save"
      />
    </div>
    <p v-else class="text-sm text-muted">
      {{ t("mapo.ai.settings.loading") }}
    </p>
  </UCard>
</template>

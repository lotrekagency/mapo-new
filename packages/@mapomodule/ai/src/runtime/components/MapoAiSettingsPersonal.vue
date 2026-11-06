<script setup lang="ts">
/**
 * The user's part of the AI settings: the provider and model they prefer,
 * the key their calls use, their own token where an admin allows it, and
 * the check of the connection.
 */
import { computed, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiKeyStatus,
  MapoAiProviderStatus,
  MapoAiStatus,
  MapoAiTestResponse,
} from "../shared/gateway";
import { preferenceApplies } from "../shared/settings";

const props = defineProps<{
  /** What `status` answered the user. */
  status: MapoAiStatus;
}>();

const emit = defineEmits<{
  /** The user saved or removed their preference or their token: `status` changes. */
  changed: [];
}>();

const client = useSettingsClient();
const { t } = client;

const providers = computed<MapoAiProviderStatus[]>(
  () => props.status.providers ?? [],
);
const providerId = shallowRef("");
const model = shallowRef("");
const provider = computed(() =>
  providers.value.find((one) => one.id === providerId.value),
);
const providerItems = computed(() =>
  providers.value.map((one) => ({ label: one.label ?? one.id, value: one.id })),
);
const modelItems = computed(() =>
  (provider.value?.models ?? []).map((one) => ({ label: one, value: one })),
);

const token = shallowRef("");
const notice = shallowRef<{ color: "success" | "error"; text: string }>();
const busy = shallowRef(false);
const check = shallowRef<MapoAiTestResponse>();
const checking = shallowRef(false);

/** The provider and model shown: the user's preference, else what applies. */
watch(
  () => props.status,
  (status) => {
    const preferred = status.preference ?? {
      provider: status.default?.provider ?? providers.value[0]?.id ?? "",
      model: status.default?.models.fill ?? "",
    };
    providerId.value = preferred.provider;
    model.value = preferred.model;
    check.value = undefined;
  },
  { immediate: true },
);

watch(providerId, () => {
  const models = provider.value?.models ?? [];
  if (!models.includes(model.value)) model.value = models[0] ?? "";
  check.value = undefined;
});

/** A preference saved that does not apply now: the page says so. */
const isPreferenceOff = computed(
  () =>
    props.status.preference !== undefined && !preferenceApplies(props.status),
);

const isPreferred = computed(
  () =>
    props.status.preference?.provider === providerId.value &&
    props.status.preference?.model === model.value,
);

/** Where the key of the chosen provider comes from, for people. */
function keyText(key: MapoAiKeyStatus): string {
  const level =
    key.level === "group"
      ? t("mapo.ai.settings.key.group", { group: key.group ?? "" })
      : key.level === "none" && !key.required
        ? t("mapo.ai.settings.key.noneOptional")
        : t(`mapo.ai.settings.key.${key.level}`);
  return key.last4
    ? `${level} · ${t("mapo.ai.settings.key.ending", { last4: key.last4 })}`
    : level;
}

async function act(done: string, change: () => Promise<unknown>) {
  busy.value = true;
  try {
    await change();
    notice.value = { color: "success", text: done };
    emit("changed");
  } catch (error) {
    notice.value = { color: "error", text: client.failureOf(error) };
  } finally {
    busy.value = false;
  }
}

function savePreference() {
  return act(t("mapo.ai.settings.preference.saved"), () =>
    client.call("/_mapo/ai/preferences", {
      method: "PUT",
      body: { provider: providerId.value, model: model.value },
    }),
  );
}

function removePreference() {
  return act(t("mapo.ai.settings.preference.removed"), () =>
    client.call("/_mapo/ai/preferences", { method: "DELETE" }),
  );
}

function saveToken() {
  const value = token.value.trim();
  token.value = "";
  return act(t("mapo.ai.settings.token.savedNotice"), () =>
    client.call("/_mapo/ai/token", {
      method: "PUT",
      body: { provider: providerId.value, token: value },
    }),
  );
}

function removeToken() {
  return act(t("mapo.ai.settings.token.removedNotice"), () =>
    client.call("/_mapo/ai/token", {
      method: "DELETE",
      query: { provider: providerId.value },
    }),
  );
}

async function checkConnection() {
  checking.value = true;
  try {
    check.value = await client.call<MapoAiTestResponse>("/_mapo/ai/test", {
      method: "POST",
      body: { provider: providerId.value, model: model.value },
    });
  } catch (error) {
    notice.value = { color: "error", text: client.failureOf(error) };
  } finally {
    checking.value = false;
  }
}

/** The check's outcome, for people. */
function checkText(result: MapoAiTestResponse): string {
  const values = {
    ms: result.latencyMs ?? 0,
    model: result.model,
    failure: result.failure ?? "",
  };
  const keys: Record<MapoAiTestResponse["outcome"], string> = {
    connected: "connected",
    "model-missing": "modelMissing",
    "no-key": "noKey",
    unverifiable: "unverifiable",
    failed: "failed",
  };
  return t(`mapo.ai.settings.check.${keys[result.outcome]}`, values);
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold text-highlighted">
        {{ t("mapo.ai.settings.personal.title") }}
      </h2>
    </template>
    <p v-if="!providers.length" class="text-sm text-muted">
      {{ t("mapo.ai.settings.personal.noProvider") }}
    </p>
    <div v-else class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('mapo.ai.settings.personal.provider')">
          <USelect v-model="providerId" :items="providerItems" class="w-full" />
        </UFormField>
        <UFormField :label="t('mapo.ai.settings.personal.model')">
          <USelect v-model="model" :items="modelItems" class="w-full" />
        </UFormField>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          :disabled="busy || isPreferred || !model"
          @click="savePreference()"
        >
          {{ t("mapo.ai.settings.preference.save") }}
        </UButton>
        <UButton
          v-if="status.preference"
          color="neutral"
          variant="soft"
          :disabled="busy"
          @click="removePreference()"
        >
          {{ t("mapo.ai.settings.preference.remove") }}
        </UButton>
        <span v-if="!status.preference" class="text-sm text-muted">
          {{ t("mapo.ai.settings.preference.appDefault") }}
        </span>
        <span v-else-if="isPreferenceOff" class="text-sm text-warning">
          {{ t("mapo.ai.settings.preference.notApplied") }}
        </span>
      </div>

      <div v-if="provider?.key" class="space-y-3">
        <p class="text-sm">
          <span class="text-muted">
            {{ t("mapo.ai.settings.key.inUse") }}
          </span>
          {{ keyText(provider.key) }}
        </p>
        <div v-if="provider.key.personal.allowed" class="space-y-2">
          <p
            v-if="provider.key.personal.saved"
            class="flex flex-wrap items-center gap-2 text-sm"
          >
            {{
              t("mapo.ai.settings.token.saved", {
                last4: provider.key.personal.last4 ?? "••••",
              })
            }}
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              :disabled="busy"
              @click="removeToken()"
            >
              {{ t("mapo.ai.settings.token.remove") }}
            </UButton>
          </p>
          <div class="flex flex-wrap gap-2">
            <UInput
              v-model="token"
              type="password"
              autocomplete="off"
              class="min-w-64 flex-1"
              :placeholder="t('mapo.ai.settings.token.placeholder')"
              :aria-label="t('mapo.ai.settings.token.placeholder')"
            />
            <UButton :disabled="busy || !token.trim()" @click="saveToken()">
              {{
                provider.key.personal.saved
                  ? t("mapo.ai.settings.token.replace")
                  : t("mapo.ai.settings.token.save")
              }}
            </UButton>
          </div>
          <p class="text-xs text-muted">
            {{ t("mapo.ai.settings.token.help") }}
          </p>
        </div>
        <p
          v-else-if="provider.key.personal.saved"
          class="flex flex-wrap items-center gap-2 text-sm text-muted"
        >
          {{ t("mapo.ai.settings.token.unused") }}
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="busy"
            @click="removeToken()"
          >
            {{ t("mapo.ai.settings.token.remove") }}
          </UButton>
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-plug-zap"
          :loading="checking"
          :disabled="!model"
          @click="checkConnection()"
        >
          {{ t("mapo.ai.settings.check.button") }}
        </UButton>
        <span
          v-if="check"
          role="status"
          class="text-sm"
          :class="check.outcome === 'connected' ? 'text-success' : 'text-error'"
        >
          {{ checkText(check) }}
        </span>
      </div>
      <UAlert
        v-if="notice"
        :color="notice.color"
        variant="subtle"
        :title="notice.text"
      />
    </div>
  </UCard>
</template>

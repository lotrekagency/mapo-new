<script setup lang="ts">
/**
 * Each provider's settings, as the admins change them: the prompt cache of
 * a cloud provider, Anthropic's fallbacks (off, or on only where the app
 * leaves them on), and the models they add where the app allows it. A
 * model is saved only once the provider's server lists it, asked with the
 * admin's own key; then it is assigned in the keys as the others.
 */
import { ref, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiProviderSettings,
  MapoAiProviderSettingsInput,
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
} from "../shared/gateway";

const props = defineProps<{
  /** The settings, as the gateway answers them. */
  settings: MapoAiSettingsAnswer;
  /** Saves a change: resolves with why it failed, or nothing. */
  save: (change: MapoAiSettingsInput) => Promise<string | undefined>;
}>();

/** The choice that follows the app's value. */
const FOLLOW_APP = "app";

/** A provider's settings as the page edits them. */
interface Draft {
  cache: string;
  fallbacks: string;
  models: string[];
  written: string;
}

const { t } = useSettingsClient();
const drafts = ref<Record<string, Draft>>({});
const busy = shallowRef<string>();
const notices = ref<
  Record<string, { color: "success" | "error"; text: string }>
>({});

watch(
  () => props.settings.providers,
  (providers) => {
    const next: Record<string, Draft> = {};
    for (const provider of providers) {
      next[provider.id] = {
        cache: choiceOf(provider.promptCache?.admin),
        fallbacks: choiceOf(provider.fallbacks?.admin),
        models: [...provider.models.added],
        written: "",
      };
    }
    drafts.value = next;
  },
  { immediate: true },
);

function choiceOf(value: boolean | undefined): string {
  return value === undefined ? FOLLOW_APP : String(value);
}

function onOff(value: boolean): string {
  return value
    ? t("mapo.ai.settings.behaviour.on")
    : t("mapo.ai.settings.behaviour.off");
}

function cacheItems(provider: MapoAiProviderSettings) {
  const app = provider.promptCache?.app ?? false;
  return [
    {
      label: t("mapo.ai.settings.behaviour.appDefault", { value: onOff(app) }),
      value: FOLLOW_APP,
    },
    { label: onOff(true), value: "true" },
    { label: onOff(false), value: "false" },
  ];
}

/** Anthropic's fallbacks: on only where the app leaves them on. */
function fallbackItems(provider: MapoAiProviderSettings) {
  const app = provider.fallbacks?.app ?? false;
  return [
    {
      label: t("mapo.ai.settings.behaviour.appDefault", { value: onOff(app) }),
      value: FOLLOW_APP,
    },
    ...(app ? [{ label: onOff(true), value: "true" }] : []),
    { label: onOff(false), value: "false" },
  ];
}

function addModel(id: string): void {
  const draft = drafts.value[id];
  const model = draft?.written.trim() ?? "";
  if (!draft || !model) return;
  if (!draft.models.includes(model)) draft.models = [...draft.models, model];
  draft.written = "";
}

function removeModel(id: string, model: string): void {
  const draft = drafts.value[id];
  if (draft) draft.models = draft.models.filter((one) => one !== model);
}

function changeOf(
  provider: MapoAiProviderSettings,
): MapoAiProviderSettingsInput {
  const draft = drafts.value[provider.id];
  if (!draft) return {};
  return {
    ...(provider.promptCache && draft.cache !== FOLLOW_APP
      ? { promptCache: draft.cache === "true" }
      : {}),
    ...(provider.fallbacks && draft.fallbacks !== FOLLOW_APP
      ? { fallbacks: draft.fallbacks === "true" }
      : {}),
    // Where the app no longer allows them, the models added stop applying,
    // and a change leaves them out: the gateway would refuse it.
    ...(provider.models.canAdd && draft.models.length
      ? { models: [...draft.models] }
      : {}),
  };
}

async function submit(provider: MapoAiProviderSettings): Promise<void> {
  busy.value = provider.id;
  const failed = await props.save({
    providers: { [provider.id]: changeOf(provider) },
  });
  notices.value = {
    ...notices.value,
    [provider.id]: failed
      ? { color: "error", text: failed }
      : { color: "success", text: t("mapo.ai.settings.behaviour.saved") },
  };
  busy.value = undefined;
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t("mapo.ai.settings.behaviour.providers.title") }}
      </h3>
      <p class="text-sm text-muted">
        {{ t("mapo.ai.settings.behaviour.providers.help") }}
      </p>
    </div>
    <div
      v-for="provider in settings.providers"
      :key="provider.id"
      class="space-y-3 rounded-md border border-default p-3"
    >
      <h4 class="text-sm font-medium">
        {{ provider.label ?? provider.id }}
      </h4>
      <template v-if="drafts[provider.id]">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            v-if="provider.promptCache"
            :label="t('mapo.ai.settings.behaviour.providers.cache')"
            :help="t('mapo.ai.settings.behaviour.providers.cacheHelp')"
          >
            <USelect
              v-model="drafts[provider.id]!.cache"
              :items="cacheItems(provider)"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="provider.fallbacks"
            :label="t('mapo.ai.settings.behaviour.providers.fallbacks')"
            :help="
              provider.fallbacks.app
                ? t('mapo.ai.settings.behaviour.providers.fallbacksHelp')
                : t('mapo.ai.settings.behaviour.providers.fallbacksOff')
            "
          >
            <USelect
              v-model="drafts[provider.id]!.fallbacks"
              :items="fallbackItems(provider)"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="space-y-2 text-sm">
          <p>
            <span class="text-muted">
              {{ t("mapo.ai.settings.behaviour.providers.appModels") }}
            </span>
            {{ provider.models.app.join(", ") }}
          </p>
          <p
            v-if="!provider.models.canAdd && provider.models.added.length"
            class="text-warning"
          >
            {{ t("mapo.ai.settings.behaviour.providers.notApplied") }}
          </p>
          <template v-if="provider.models.canAdd">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="model in drafts[provider.id]!.models"
                :key="model"
                color="primary"
                variant="subtle"
              >
                {{ model }}
                <UButton
                  size="xs"
                  color="primary"
                  variant="link"
                  icon="i-lucide-x"
                  :aria-label="
                    t('mapo.ai.settings.behaviour.providers.removeModel', {
                      model,
                    })
                  "
                  @click="removeModel(provider.id, model)"
                />
              </UBadge>
            </div>
            <div class="flex flex-wrap gap-2">
              <UInput
                v-model="drafts[provider.id]!.written"
                :placeholder="
                  t('mapo.ai.settings.behaviour.providers.modelPlaceholder')
                "
                :aria-label="
                  t('mapo.ai.settings.behaviour.providers.modelPlaceholder')
                "
                class="w-72"
                @keydown.enter.prevent="addModel(provider.id)"
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-plus"
                @click="addModel(provider.id)"
              >
                {{ t("mapo.ai.settings.behaviour.providers.addModel") }}
              </UButton>
            </div>
            <p class="text-xs text-muted">
              {{ t("mapo.ai.settings.behaviour.providers.modelNote") }}
            </p>
          </template>
          <p v-else class="text-xs text-muted">
            {{ t("mapo.ai.settings.behaviour.providers.cannotAdd") }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            :loading="busy === provider.id"
            :disabled="busy !== undefined"
            @click="submit(provider)"
          >
            {{ t("mapo.ai.settings.behaviour.save") }}
          </UButton>
        </div>
        <UAlert
          v-if="notices[provider.id]"
          :color="notices[provider.id]!.color"
          variant="subtle"
          :title="notices[provider.id]!.text"
        />
      </template>
    </div>
  </section>
</template>

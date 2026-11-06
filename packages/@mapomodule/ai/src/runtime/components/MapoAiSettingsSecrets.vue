<script setup lang="ts">
/**
 * The words that name a secret: a field whose key, or a key around it,
 * holds one as whole words is never filled by the AI. Mapo's and the
 * app's are shown, and stay; the admins add their own.
 */
import { ref, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import { readSecretWord } from "../shared/entity";
import type {
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
} from "../shared/gateway";

const props = defineProps<{
  /** The settings, as the gateway answers them. */
  settings: MapoAiSettingsAnswer;
  /** Saves a change: resolves with why it failed, or nothing. */
  save: (change: MapoAiSettingsInput) => Promise<string | undefined>;
}>();

const { t } = useSettingsClient();
const words = ref<string[]>([]);
const written = ref("");
const invalid = shallowRef(false);
const busy = shallowRef(false);
const notice = shallowRef<{ color: "success" | "error"; text: string }>();

watch(
  () => props.settings.secretWords.admin,
  (admin) => {
    words.value = [...admin];
  },
  { immediate: true },
);

/** Adds the word written, as the gateway reads it; says so when it cannot. */
function add(): void {
  const word = readSecretWord(written.value);
  invalid.value = word === undefined;
  if (word === undefined) return;
  if (!words.value.includes(word)) words.value = [...words.value, word];
  written.value = "";
}

function remove(word: string): void {
  words.value = words.value.filter((one) => one !== word);
}

async function submit(): Promise<void> {
  busy.value = true;
  const failed = await props.save({ secretWords: [...words.value] });
  notice.value = failed
    ? { color: "error", text: failed }
    : { color: "success", text: t("mapo.ai.settings.behaviour.saved") };
  busy.value = false;
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t("mapo.ai.settings.behaviour.secrets.title") }}
      </h3>
      <p class="text-sm text-muted">
        {{ t("mapo.ai.settings.behaviour.secrets.help") }}
      </p>
    </div>
    <div class="space-y-2 text-sm">
      <p class="text-muted">
        {{ t("mapo.ai.settings.behaviour.secrets.mapo") }}
      </p>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="word in settings.secretWords.mapo"
          :key="word"
          color="neutral"
          variant="subtle"
        >
          {{ word }}
        </UBadge>
      </div>
      <p class="text-muted">
        {{ t("mapo.ai.settings.behaviour.secrets.app") }}
      </p>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="word in settings.secretWords.app"
          :key="word"
          color="neutral"
          variant="outline"
        >
          {{ word }}
        </UBadge>
        <span v-if="!settings.secretWords.app.length" class="text-muted">
          {{ t("mapo.ai.settings.behaviour.secrets.none") }}
        </span>
      </div>
      <p class="text-muted">
        {{ t("mapo.ai.settings.behaviour.secrets.admin") }}
      </p>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="word in words"
          :key="word"
          color="primary"
          variant="subtle"
        >
          {{ word }}
          <UButton
            size="xs"
            color="primary"
            variant="link"
            icon="i-lucide-x"
            :aria-label="
              t('mapo.ai.settings.behaviour.secrets.remove', { word })
            "
            @click="remove(word)"
          />
        </UBadge>
        <span v-if="!words.length" class="text-muted">
          {{ t("mapo.ai.settings.behaviour.secrets.none") }}
        </span>
      </div>
    </div>
    <UFormField
      :error="invalid ? t('mapo.ai.settings.behaviour.secrets.invalid') : false"
    >
      <div class="flex flex-wrap gap-2">
        <UInput
          v-model="written"
          :placeholder="t('mapo.ai.settings.behaviour.secrets.placeholder')"
          :aria-label="t('mapo.ai.settings.behaviour.secrets.placeholder')"
          class="w-72"
          @keydown.enter.prevent="add()"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          @click="add()"
        >
          {{ t("mapo.ai.settings.behaviour.secrets.add") }}
        </UButton>
      </div>
    </UFormField>
    <div class="flex items-center gap-2">
      <UButton :disabled="busy" @click="submit()">
        {{ t("mapo.ai.settings.behaviour.save") }}
      </UButton>
    </div>
    <UAlert
      v-if="notice"
      :color="notice.color"
      variant="subtle"
      :title="notice.text"
    />
  </section>
</template>

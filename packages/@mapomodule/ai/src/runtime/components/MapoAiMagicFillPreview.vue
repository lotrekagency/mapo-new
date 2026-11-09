<script setup lang="ts">
/**
 * "What I send to the AI", in Magic Fill's panel: what a call would send
 * now, as the gateway composes it with `run/preview`, which calls no
 * provider. The model; the rules and instructions the model reads (Mapo's,
 * the app's, the admins', the record); the operator's instructions; the
 * source, by part and length; the fields the AI may fill and those kept
 * away from it, with why. Never a key. Asked when it is shown with nothing
 * current to show, and again on request: a change to the panel marks it
 * stale and asks nothing by itself, so opening it again or typing spends
 * nothing.
 */
import { computed, onMounted } from "vue";
import { useMapoAiMagicFill } from "../composables/useMapoAiMagicFill";
import type { MapoAiMagicFillDetail } from "../composables/useMapoAiMagicFill";
import { mapoAiSkipReasonKey } from "../shared/magicFill";

const props = defineProps<{
  /** The detail it fills: the context of `MapoDetail`, from `useMapoDetail()`. */
  detail: MapoAiMagicFillDetail;
}>();

const magic = useMapoAiMagicFill(props.detail);
const { t, preview } = magic;

onMounted(() => {
  const { state, stale } = preview.value;
  const isCurrent = (state === "ready" || state === "loading") && !stale;
  if (!isCurrent) void magic.loadPreview();
});

const answer = computed(() => preview.value.answer);
const isLoading = computed(() => preview.value.state === "loading");
const sourceLines = computed(() => {
  const parts = answer.value?.parts ?? [];
  const isNothing = parts.every((part) => part.chars === 0);
  if (isNothing) return [t("mapo.ai.magicFill.preview.noSource")];
  return parts
    .filter((part) => part.chars > 0)
    .map((part) =>
      part.name
        ? t("mapo.ai.magicFill.preview.part", {
            name: part.name,
            n: part.chars,
          })
        : t("mapo.ai.magicFill.preview.pasted", { n: part.chars }),
    );
});

/** Why a field is kept away, in words; a reason this client does not name, as written. */
function reasonText(reason: string): string {
  const key = mapoAiSkipReasonKey(reason);
  return key ? t(key) : reason;
}
</script>

<template>
  <div class="space-y-3 text-sm">
    <div class="flex items-start justify-between gap-2">
      <p class="text-xs text-muted">
        {{ t("mapo.ai.magicFill.whatISendHint") }}
      </p>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        :label="t('mapo.ai.magicFill.preview.refresh')"
        :loading="isLoading"
        @click="magic.loadPreview()"
      />
    </div>
    <p v-if="answer && preview.stale" class="text-xs text-warning">
      {{ t("mapo.ai.magicFill.preview.stale") }}
    </p>
    <p v-if="isLoading && !answer" class="text-muted">
      {{ t("mapo.ai.magicFill.preview.loading") }}
    </p>
    <UAlert
      v-else-if="preview.state === 'failed'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="preview.error"
    />
    <dl v-else-if="answer" class="space-y-3">
      <div>
        <dt class="font-medium">{{ t("mapo.ai.magicFill.preview.model") }}</dt>
        <dd>{{ answer.provider.id }} · {{ answer.provider.model }}</dd>
      </div>
      <div>
        <dt class="font-medium">{{ t("mapo.ai.magicFill.preview.rules") }}</dt>
        <dd class="space-y-1">
          <p class="text-xs text-muted">
            {{
              t("mapo.ai.magicFill.preview.rulesVersion", {
                version: answer.prompt,
              })
            }}
          </p>
          <pre
            class="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-elevated p-2 text-xs"
            >{{ answer.instructions }}</pre
          >
        </dd>
      </div>
      <div v-if="answer.operator">
        <dt class="font-medium">
          {{ t("mapo.ai.magicFill.preview.operator") }}
        </dt>
        <dd>
          <pre
            class="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-elevated p-2 text-xs"
            >{{ answer.operator }}</pre
          >
        </dd>
      </div>
      <div>
        <dt class="font-medium">{{ t("mapo.ai.magicFill.preview.source") }}</dt>
        <dd>
          <ul>
            <li v-for="line in sourceLines" :key="line">{{ line }}</li>
          </ul>
        </dd>
      </div>
      <template v-for="(entity, index) in answer.entities" :key="index">
        <div>
          <dt class="font-medium">
            {{ t("mapo.ai.magicFill.preview.fields") }}
          </dt>
          <dd>
            {{
              entity.fields
                .map((field) => field.label ?? magic.labelOf(field.key))
                .join(", ")
            }}
          </dd>
        </div>
        <div v-if="entity.skipped.length">
          <dt class="font-medium">
            {{ t("mapo.ai.magicFill.preview.skipped") }}
          </dt>
          <dd>
            <ul>
              <li v-for="field in entity.skipped" :key="field.key">
                {{ field.label ?? magic.labelOf(field.key) }}:
                {{ reasonText(field.reason) }}
              </li>
            </ul>
          </dd>
        </div>
      </template>
    </dl>
  </div>
</template>

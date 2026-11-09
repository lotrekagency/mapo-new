<script setup lang="ts">
/**
 * Magic Fill above the detail's form: where a call is, with Cancel; why it
 * failed; and after an answer the summary, in view until the next one:
 * what went into the form, what waits for the operator, what to set by
 * hand, what the gateway discarded and what the AI did not find, with
 * Undo all. On a phone, where the sidebar card comes after the form, and
 * on a page that leaves out the sidebar's button, it also opens the panel.
 * The module adds it to every `MapoDetail`, with the button.
 */
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import {
  joinMagicFill,
  useMapoAiMagicFill,
} from "../composables/useMapoAiMagicFill";
import type { MapoAiMagicFillDetail } from "../composables/useMapoAiMagicFill";
import { mapoAiValueText } from "../shared/fill";
import type { MapoAiToConfirm } from "../shared/magicFill";

const props = defineProps<{
  /** The detail it fills: the context of `MapoDetail`, from `useMapoDetail()`. */
  detail: MapoAiMagicFillDetail;
}>();

/** Seconds of waiting after which the banner says that a call can take minutes. */
const SLOW_AFTER_SECONDS = 20;

const magic = useMapoAiMagicFill(props.detail);
const { t, available, choices, phase, startedAt, summary, open } = magic;
const { error, response, fields } = magic.fill;
const presence = joinMagicFill(magic, "banner");
onBeforeUnmount(presence.leave);
// The first of the button and the banner renders the panel.
const { isFirst: rendersPanel, hasAction } = presence;

// The time the call takes, counted every second while it runs.
const now = shallowRef(Date.now());
let ticking: ReturnType<typeof globalThis.setInterval> | undefined;
function stopTicking(): void {
  if (ticking !== undefined) globalThis.clearInterval(ticking);
  ticking = undefined;
}
onMounted(() => {
  watch(
    phase,
    (value) => {
      stopTicking();
      if (value === "idle") return;
      now.value = Date.now();
      ticking = globalThis.setInterval(() => {
        now.value = Date.now();
      }, 1000);
    },
    { immediate: true },
  );
});
onBeforeUnmount(stopTicking);

const isRunning = computed(() => phase.value !== "idle");
const seconds = computed(() =>
  startedAt.value === undefined
    ? 0
    : Math.max(0, Math.floor((now.value - startedAt.value) / 1000)),
);
const isSlow = computed(() => seconds.value >= SLOW_AFTER_SECONDS);
const phaseText = computed(() => {
  if (phase.value === "describing") {
    return t("mapo.ai.magicFill.phases.describing");
  }
  const picked = magic.choice.value;
  const minutes = Math.floor(seconds.value / 60);
  const rest = String(seconds.value % 60).padStart(2, "0");
  return t("mapo.ai.magicFill.phases.waiting", {
    provider: picked?.providerLabel ?? "",
    model: picked?.model ?? "",
    elapsed: `${minutes}:${rest}`,
  });
});

const refusal = computed(() =>
  response.value?.status === "refused" ? response.value.refusal : undefined,
);
const isUnreadable = computed(
  () =>
    response.value?.status === "answered" && !response.value.result.readable,
);
const answeredBy = computed(() => response.value?.provider);
const hasApplied = computed(() => fields.value.some((field) => field.applied));
const isNothingNew = computed(() => {
  const found = summary.value;
  if (!found) return false;
  const changed = found.applied + found.toConfirm.length + found.manual;
  return changed === 0;
});
const counts = computed(() => {
  const found = summary.value;
  if (!found) return [];
  return [
    { key: "applied", n: found.applied },
    { key: "toConfirm", n: found.toConfirm.length },
    { key: "manual", n: found.manual },
    { key: "discarded", n: found.discarded },
    { key: "notFound", n: found.notFound },
  ].filter((count) => count.n > 0);
});
// Nothing of a call to show: the banner offers the panel, on a phone, or
// wherever the sidebar's button is left out.
const isQuiet = computed(
  () => !isRunning.value && !error.value && !response.value,
);
const hasNoModel = computed(() => choices.value.length === 0);

function openPanel(): void {
  open.value = true;
}

/** A value that waits, as the summary shows it: its text, or its items. */
function valueText(item: MapoAiToConfirm): string {
  if (item.items) {
    return t("mapo.ai.magicFill.summary.items", {
      verified: item.items.verified,
      total: item.items.total,
    });
  }
  return mapoAiValueText(item.value, 80);
}

function reasonsText(item: MapoAiToConfirm): string {
  return item.reasons
    .map((reason) => t(`mapo.ai.magicFill.summary.reasons.${reason}`))
    .join(" · ");
}

/** A hidden field is never written from here: the operator would not see it go in. */
function canApply(item: MapoAiToConfirm): boolean {
  return !item.reasons.includes("hidden");
}
</script>

<template>
  <div v-if="available" class="mb-4 space-y-3 text-sm">
    <div
      v-if="isRunning"
      role="status"
      aria-live="polite"
      class="flex flex-wrap items-center gap-3 rounded-md border border-default bg-elevated px-3 py-2"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-4 animate-spin text-primary"
        aria-hidden="true"
      />
      <span class="flex-1">{{ phaseText }}</span>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :label="t('mapo.ai.magicFill.cancel')"
        @click="magic.cancel()"
      />
      <p v-if="isSlow" class="basis-full text-xs text-muted">
        {{ t("mapo.ai.magicFill.phases.slow") }}
      </p>
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error.message"
      :actions="[
        {
          label: t('mapo.ai.magicFill.summary.again'),
          color: 'neutral',
          variant: 'outline',
          onClick: openPanel,
        },
      ]"
    />

    <UAlert
      v-if="refusal"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      :title="t('mapo.ai.magicFill.summary.refused', { refusal })"
    />
    <UAlert
      v-else-if="isUnreadable"
      color="warning"
      variant="subtle"
      icon="i-lucide-file-question"
      :title="t('mapo.ai.magicFill.summary.unreadable')"
    />
    <section
      v-else-if="summary"
      class="space-y-2 rounded-md border border-default p-3"
      aria-live="polite"
    >
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon
            name="i-lucide-sparkles"
            class="size-4 text-primary"
            aria-hidden="true"
          />
          <h2 class="font-semibold text-highlighted">
            {{ t("mapo.ai.magicFill.summary.title") }}
          </h2>
          <span v-if="answeredBy" class="text-xs text-muted">
            {{
              t("mapo.ai.magicFill.summary.by", {
                provider: answeredBy.id,
                model: answeredBy.model,
              })
            }}
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="hasApplied"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            :label="t('mapo.ai.magicFill.summary.undoAll')"
            @click="magic.undoAll()"
          />
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-sparkles"
            :label="t('mapo.ai.magicFill.summary.again')"
            :disabled="hasNoModel || isRunning"
            @click="openPanel"
          />
        </div>
      </header>
      <p v-if="isNothingNew" class="text-muted">
        {{ t("mapo.ai.magicFill.summary.nothing") }}
      </p>
      <ul v-if="counts.length" class="flex flex-wrap gap-x-4 gap-y-1">
        <li v-for="count in counts" :key="count.key">
          {{ t(`mapo.ai.magicFill.summary.${count.key}`, { n: count.n }) }}
        </li>
      </ul>
      <!-- TEMP(ai-magicfill-preview): the values that wait, with Apply one
           by one; step 15's preview of the values replaces this list. -->
      <div v-if="summary.toConfirm.length" class="space-y-1">
        <p class="font-medium">
          {{ t("mapo.ai.magicFill.summary.toConfirmTitle") }}
        </p>
        <p class="text-xs text-muted">
          {{ t("mapo.ai.magicFill.summary.toConfirmHint") }}
        </p>
        <ul class="divide-y divide-default">
          <li
            v-for="item in summary.toConfirm"
            :key="item.path"
            class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1"
          >
            <span class="font-medium">{{ magic.labelOf(item.key) }}</span>
            <span class="min-w-0 truncate text-muted">{{
              valueText(item)
            }}</span>
            <span v-if="item.reasons.length" class="text-xs text-muted">
              {{ reasonsText(item) }}
            </span>
            <UButton
              class="ms-auto"
              size="xs"
              variant="soft"
              :label="t('mapo.apply')"
              :disabled="!canApply(item)"
              @click="magic.fill.apply(item.path)"
            />
          </li>
        </ul>
      </div>
    </section>

    <div
      v-if="isQuiet"
      class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default px-3 py-2"
      :class="hasAction ? 'md:hidden' : ''"
    >
      <span class="text-muted">{{
        hasNoModel
          ? t("mapo.ai.magicFill.noProvider")
          : t("mapo.ai.magicFill.actionHint")
      }}</span>
      <UButton
        size="sm"
        variant="soft"
        icon="i-lucide-sparkles"
        :label="t('mapo.ai.magicFill.action')"
        :disabled="hasNoModel"
        @click="openPanel"
      />
    </div>
    <MapoAiMagicFillPanel v-if="rendersPanel" :detail="detail" />
  </div>
</template>

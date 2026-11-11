<script setup lang="ts">
/**
 * Magic Fill above the detail's form: where a call is, with Cancel; why it
 * failed, or that the model refused; and the summary of the session, in
 * view until it ends, beside a later failure or refusal: what went into
 * the form, what the operator kept or changed, what the record already
 * held, what to set by hand, what the gateway discarded and what the AI
 * did not find, with Undo all. Below it, the preview of the values that
 * wait: to fill, to replace (before and after), without proof, each with
 * a tick, and Apply for the ticked ones. On a phone, where the sidebar
 * card comes after the form, and on a page that leaves out the sidebar's
 * button, it also opens the panel. The module adds it to every
 * `MapoDetail`, with the button.
 */
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import {
  joinMagicFill,
  useMapoAiMagicFill,
} from "../composables/useMapoAiMagicFill";
import type { MapoAiMagicFillDetail } from "../composables/useMapoAiMagicFill";
import { mapoAiValueText } from "../shared/fill";
import type {
  MapoAiProposedItem,
  MapoAiToConfirm,
  MapoAiWaitReason,
} from "../shared/magicFill";

const props = defineProps<{
  /** The detail it fills: the context of `MapoDetail`, from `useMapoDetail()`. */
  detail: MapoAiMagicFillDetail;
}>();

/** Seconds of waiting after which the banner says that a call can take minutes. */
const SLOW_AFTER_SECONDS = 20;

const magic = useMapoAiMagicFill(props.detail);
const { t, available, choices, phase, startedAt, summary, open, selected } =
  magic;
const { error, response, fields, rounds, answers } = magic.fill;
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
// The model of the session's last answer: a refusal has its own line, and a
// session restored from a draft has no answer of this page.
const answeredBy = computed(() => answers.value.at(-1)?.provider);
// Something of the AI's in the form that Undo all would put back.
const hasApplied = computed(() => fields.value.some((field) => field.undoable));
// The last answer joined the session and gave no field a new value, the
// first answer included: it says so, while the session's summary stays. A
// value the record already held is nothing new.
const isNothingNew = computed(() => {
  const last = rounds.value;
  const reply = response.value;
  const isJoined = reply?.status === "answered" && reply.result.readable;
  if (last === 0 || !isJoined) return false;
  const isNew = (field: (typeof fields.value)[number]) =>
    field.round === last &&
    field.outcome.status === "filled" &&
    field.action !== "unchanged";
  return !fields.value.some(isNew);
});
/** A group of the preview, and the reasons its title already says. */
interface PreviewGroup {
  key: "toFill" | "toReplace" | "unproven";
  items: MapoAiToConfirm[];
  said: MapoAiWaitReason[];
}

/** The values that wait, by the group of the preview that lists them. */
const groups = computed<PreviewGroup[]>(() => {
  const found = summary.value;
  if (!found) return [];
  const all: PreviewGroup[] = [
    { key: "toFill", items: found.toFill, said: [] },
    { key: "toReplace", items: found.toReplace, said: ["replaces"] },
    { key: "unproven", items: found.unproven, said: ["not-proven"] },
  ];
  return all.filter((group) => group.items.length > 0);
});
const counts = computed(() => {
  const found = summary.value;
  if (!found) return [];
  const waiting =
    found.toFill.length + found.toReplace.length + found.unproven.length;
  return [
    { key: "applied", n: found.applied },
    { key: "kept", n: found.kept },
    { key: "edited", n: found.edited },
    { key: "toConfirm", n: waiting },
    { key: "unchanged", n: found.unchanged },
    { key: "manual", n: found.manual },
    { key: "discarded", n: found.discarded },
    { key: "notFound", n: found.notFound },
  ].filter((count) => count.n > 0);
});
// Nothing of a call or a session to show: the banner offers the panel, on a
// phone, or wherever the sidebar's button is left out.
const isQuiet = computed(
  () =>
    !isRunning.value && !error.value && !response.value && rounds.value === 0,
);
const hasNoModel = computed(() => choices.value.length === 0);

function openPanel(): void {
  open.value = true;
}

/** A value that waits, as the preview shows it: its text, or its items. */
function valueText(item: MapoAiToConfirm): string {
  if (item.items) {
    return t("mapo.ai.magicFill.summary.items", {
      verified: item.items.verified,
      total: item.items.total,
    });
  }
  return mapoAiValueText(item.value, 80);
}

/**
 * What a replacement takes away, as the preview shows it: the field's
 * value now, and each other language's value a `synci18n` write would
 * replace (`en: …`). Empty when that shows nothing.
 */
function currentText(item: MapoAiToConfirm): string {
  const others = Object.entries(item.languages ?? {}).map(
    ([language, held]) => `${language}: ${heldText(held)}`,
  );
  return [heldText(item.current), ...others].filter(Boolean).join(" · ");
}

/** A value a field holds, as the preview shows it: its text, or how many items its list has. */
function heldText(value: unknown): string {
  if (!Array.isArray(value)) return mapoAiValueText(value, 80);
  if (value.length === 0) return "";
  const text = mapoAiValueText(value, 80);
  return text || t("mapo.ai.fill.items", { n: value.length });
}

/** Why a value waits, but what its group's title already says. */
function reasonsText(item: MapoAiToConfirm, said: MapoAiWaitReason[]): string {
  return item.reasons
    .filter((reason) => !said.includes(reason))
    .map((reason) => t(`mapo.ai.magicFill.summary.reasons.${reason}`))
    .join(" · ");
}

/**
 * What the preview says under a value: the words that prove it, and why it
 * waits. A list says how many items its field holds, which its own join;
 * its items say whether each is proved, and its value how many are, so the
 * list itself names no quote and does not say that none proves it.
 */
function notesText(item: MapoAiToConfirm, said: MapoAiWaitReason[]): string {
  const proof =
    item.quote && !item.list
      ? t("mapo.ai.fill.proven", { quote: mapoAiValueText(item.quote, 80) })
      : "";
  const own = Array.isArray(item.current) ? item.current.length : 0;
  const joins =
    item.list && own > 0
      ? t("mapo.ai.magicFill.summary.addsTo", { n: own })
      : "";
  const told: MapoAiWaitReason[] = item.list ? [...said, "not-proven"] : said;
  return [proof, joins, reasonsText(item, told)].filter(Boolean).join(" · ");
}

/** An item of a list as its tick says it: verified, to check, or already in the list. */
function itemNote(one: MapoAiProposedItem): string {
  if (one.held) return t("mapo.ai.magicFill.summary.itemHeld");
  return one.verified
    ? t("mapo.ai.magicFill.summary.itemVerified")
    : t("mapo.ai.magicFill.summary.itemToCheck");
}

/**
 * The tick of a value: for a list, ticked when every item it may add is,
 * half when some are.
 */
function tickOf(item: MapoAiToConfirm): boolean | "indeterminate" {
  if (!item.list) return magic.isSelected(item.path);
  const addable = item.list.filter((one) => !one.held);
  const ticked = addable.filter((one) =>
    magic.isItemSelected(item.path, one.index),
  );
  if (!ticked.length) return false;
  return ticked.length === addable.length ? true : "indeterminate";
}

/** A hidden field is never ticked nor written: the operator would not see it go in. */
function canApply(item: MapoAiToConfirm): boolean {
  return !item.reasons.includes("hidden");
}

/** The box of a value: off for a hidden field, and for a list with nothing to add. */
function canTick(item: MapoAiToConfirm): boolean {
  const hasNothingToAdd = item.list?.every((one) => one.held) === true;
  return canApply(item) && !hasNothingToAdd;
}

/** A tick of a value's checkbox: for a list, every item it may add. */
function onTick(path: string, value: unknown): void {
  magic.select(path, value === true);
}

/** A tick of an item of a list. */
function onItemTick(path: string, index: number, value: unknown): void {
  magic.selectItem(path, index, value === true);
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
    <!-- The session's summary stays beside a later refusal or failure. -->
    <section
      v-if="summary"
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
      <!-- The preview: the values that wait, by group, each with a tick.
           Apply writes the ticked ones; the others keep waiting. -->
      <div v-if="groups.length" class="space-y-3 border-t border-default pt-3">
        <fieldset v-for="group in groups" :key="group.key" class="space-y-1">
          <legend class="font-medium">
            {{ t(`mapo.ai.magicFill.summary.${group.key}Title`) }}
          </legend>
          <p class="text-xs text-muted">
            {{ t(`mapo.ai.magicFill.summary.${group.key}Hint`) }}
          </p>
          <ul class="divide-y divide-default">
            <li v-for="item in group.items" :key="item.path" class="py-1.5">
              <UCheckbox
                :model-value="tickOf(item)"
                :disabled="!canTick(item)"
                :label="magic.labelOf(item.key)"
                :ui="{ label: 'font-medium', description: 'text-default' }"
                @update:model-value="onTick(item.path, $event)"
              >
                <template #description>
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <template
                      v-if="group.key === 'toReplace' && currentText(item)"
                    >
                      <span class="min-w-0 truncate text-muted line-through">{{
                        currentText(item)
                      }}</span>
                      <UIcon
                        name="i-lucide-arrow-right"
                        class="size-3.5 shrink-0 text-muted"
                        aria-hidden="true"
                      />
                      <span class="sr-only">{{
                        t("mapo.ai.magicFill.summary.replacedBy")
                      }}</span>
                    </template>
                    <span class="min-w-0 truncate">{{ valueText(item) }}</span>
                  </span>
                  <span
                    v-if="notesText(item, group.said)"
                    class="block text-xs text-muted"
                  >
                    {{ notesText(item, group.said) }}
                  </span>
                </template>
              </UCheckbox>
              <!-- A list's items, each with its own tick: they go after the
                   items the field holds, and one it holds is not added. -->
              <ul v-if="item.list" class="mt-1 space-y-1 ps-6">
                <li v-for="one in item.list" :key="one.index">
                  <UCheckbox
                    :model-value="magic.isItemSelected(item.path, one.index)"
                    :disabled="one.held || !canApply(item)"
                    :label="magic.itemLabelOf(item.key, one)"
                    :description="itemNote(one)"
                    :ui="{ description: 'text-xs text-muted' }"
                    @update:model-value="
                      onItemTick(item.path, one.index, $event)
                    "
                  />
                </li>
              </ul>
            </li>
          </ul>
        </fieldset>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :label="t('mapo.ai.magicFill.summary.ignoreAll')"
            @click="magic.ignoreWaiting()"
          />
          <UButton
            size="xs"
            icon="i-lucide-check"
            :label="
              t('mapo.ai.magicFill.summary.applySelected', {
                n: selected.length,
              })
            "
            :disabled="selected.length === 0"
            @click="magic.applySelected()"
          />
        </div>
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

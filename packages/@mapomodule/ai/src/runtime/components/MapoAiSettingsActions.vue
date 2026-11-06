<script setup lang="ts">
/**
 * The changes of the keys and of the AI settings in a period, for the AI's
 * admins (`/_mapo/ai/actions`): who changed what, for whom, and which rules
 * of verification became less prudent. Never a key, an instruction or a
 * word: the audit holds none of them.
 */
import { onMounted, ref, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type { MapoAiAction, MapoAiActionsAnswer } from "../shared/gateway";

/** The periods offered, in days. */
const PERIODS = [7, 30, 90] as const;

/** The labels of the kinds of change: vue-i18n keys have no `-`. */
const KINDS: Record<MapoAiAction["action"], string> = {
  "assignment-saved": "assignmentSaved",
  "assignment-removed": "assignmentRemoved",
  "groups-ordered": "groupsOrdered",
  "token-saved": "tokenSaved",
  "token-removed": "tokenRemoved",
  "settings-saved": "settingsSaved",
};

const client = useSettingsClient();
const { t } = client;
const days = ref<number>(30);
const answer = shallowRef<MapoAiActionsAnswer>();
const failure = shallowRef<string>();

const periodItems = PERIODS.map((n) => ({
  label: t("mapo.ai.settings.usage.days", { n }),
  value: n,
}));

async function load(): Promise<void> {
  try {
    answer.value = await client.call<MapoAiActionsAnswer>("/_mapo/ai/actions", {
      query: { days: String(days.value) },
    });
    failure.value = undefined;
  } catch (error) {
    failure.value = client.failureOf(error);
  }
}

watch(days, load);
onMounted(load);

/** What a change touched, for people: never a key or a text. */
function detailsOf(action: MapoAiAction): string {
  const parts: string[] = [];
  if (action.provider) parts.push(action.provider);
  if (action.scope) {
    const { scope } = action;
    parts.push(
      scope.kind === "all"
        ? t("mapo.ai.settings.scope.all")
        : scope.kind === "group"
          ? t("mapo.ai.settings.scope.group", { group: scope.group })
          : t("mapo.ai.settings.scope.user", {
              user: scope.label ?? scope.user,
            }),
    );
  }
  if (action.user) {
    parts.push(t("mapo.ai.settings.actions.ofUser", { user: action.user }));
  }
  if (action.keyChanged) parts.push(t("mapo.ai.settings.actions.keyChanged"));
  if (action.blocks?.length) {
    parts.push(
      action.blocks
        .map((block) => t(`mapo.ai.settings.actions.blocks.${block}`))
        .join(", "),
    );
  }
  if (action.providers?.length) parts.push(action.providers.join(", "));
  if (action.loosened?.length) {
    parts.push(
      t("mapo.ai.settings.actions.loosened", {
        rules: action.loosened
          .map((rule) => t(`mapo.ai.settings.behaviour.rules.${rule}.label`))
          .join(", "),
      }),
    );
  }
  return parts.join(" · ");
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold text-highlighted">
            {{ t("mapo.ai.settings.actions.title") }}
          </h2>
          <p class="text-sm text-muted">
            {{ t("mapo.ai.settings.actions.intro") }}
          </p>
        </div>
        <USelect
          v-model="days"
          :items="periodItems"
          :aria-label="t('mapo.ai.settings.usage.period')"
          class="w-44"
        />
      </div>
    </template>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="failure"
    />
    <div v-else-if="answer" class="space-y-2 text-sm">
      <p v-if="!answer.actions.length" class="text-muted">
        {{ t("mapo.ai.settings.actions.empty") }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="text-left text-muted">
            <tr>
              <th class="py-1 pr-3 font-medium">
                {{ t("mapo.ai.settings.usage.when") }}
              </th>
              <th class="py-1 pr-3 font-medium">
                {{ t("mapo.ai.settings.actions.who") }}
              </th>
              <th class="py-1 pr-3 font-medium">
                {{ t("mapo.ai.settings.actions.what") }}
              </th>
              <th class="py-1 font-medium">
                {{ t("mapo.ai.settings.actions.details") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(action, index) in answer.actions"
              :key="`${index}-${action.at}`"
              class="border-t border-default align-top"
            >
              <td class="py-1 pr-3">
                {{ new Date(action.at).toLocaleString() }}
              </td>
              <td class="py-1 pr-3">
                {{ action.by.username ?? action.by.id }}
              </td>
              <td class="py-1 pr-3">
                {{
                  t(`mapo.ai.settings.actions.kinds.${KINDS[action.action]}`)
                }}
              </td>
              <td class="py-1">{{ detailsOf(action) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="answer.truncated" class="text-xs text-muted">
        {{ t("mapo.ai.settings.actions.truncated") }}
      </p>
    </div>
  </UCard>
</template>

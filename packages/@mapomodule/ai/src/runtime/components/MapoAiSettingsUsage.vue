<script setup lang="ts">
/**
 * The usage of the AI in a period, summed from the audit: the AI's admins
 * see every user's calls (`/_mapo/ai/usage`), a user their own
 * (`/_mapo/ai/usage/mine`). Calls, outcomes and tokens, by user, model and
 * day, the latest calls, and the cost where the app prices the model.
 * Never what was sent: the audit holds none of it.
 */
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiUsageAnswer,
  MapoAiUsageCall,
  MapoAiUsageTotals,
} from "../shared/gateway";

const props = defineProps<{
  /** `all`: every user's calls, for the AI's admins; `mine`: the user's own. */
  scope: "all" | "mine";
}>();

/** The periods offered, in days. */
const PERIODS = [7, 30, 90] as const;

const client = useSettingsClient();
const { t } = client;
const days = ref<number>(30);
const usage = shallowRef<MapoAiUsageAnswer>();
const failure = shallowRef<string>();
const loading = shallowRef(false);

const periodItems = PERIODS.map((n) => ({
  label: t("mapo.ai.settings.usage.days", { n }),
  value: n,
}));

async function load(): Promise<void> {
  loading.value = true;
  const path =
    props.scope === "all" ? "/_mapo/ai/usage" : "/_mapo/ai/usage/mine";
  try {
    usage.value = await client.call<MapoAiUsageAnswer>(path, {
      query: { days: String(days.value) },
    });
    failure.value = undefined;
  } catch (error) {
    failure.value = client.failureOf(error);
  } finally {
    loading.value = false;
  }
}

watch(days, load);
onMounted(load);

const numbers = computed(() => new Intl.NumberFormat());
const money = computed(() => {
  const currency = usage.value?.currency ?? "USD";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
  });
});

/** A group's cost, or a dash when the app prices none of its models. */
function costText(group: { cost?: number }): string {
  return group.cost === undefined ? "—" : money.value.format(group.cost);
}

/** A group's tokens: the prompt's, the answer's, and the cache's share. */
function tokensText(group: MapoAiUsageTotals): string {
  const cached = group.cacheReadTokens + group.cacheWriteTokens;
  const base = `${numbers.value.format(group.inputTokens)} / ${numbers.value.format(group.outputTokens)}`;
  return cached
    ? `${base} · ${t("mapo.ai.settings.usage.cached", { n: numbers.value.format(cached) })}`
    : base;
}

function callTokens(call: MapoAiUsageCall): string {
  return `${numbers.value.format(call.usage.inputTokens)} / ${numbers.value.format(call.usage.outputTokens)}`;
}

function outcomeText(call: MapoAiUsageCall): string {
  const outcome = t(`mapo.ai.settings.usage.outcomes.${call.outcome}`);
  return call.failure ? `${outcome} (${call.failure})` : outcome;
}

const hasUnpriced = computed(() => {
  const totals = usage.value?.totals;
  return totals !== undefined && totals.unpricedCalls > 0;
});
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold text-highlighted">
            {{
              scope === "all"
                ? t("mapo.ai.settings.usage.title")
                : t("mapo.ai.settings.usage.titleMine")
            }}
          </h2>
          <p class="text-sm text-muted">
            {{ t("mapo.ai.settings.usage.intro") }}
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
    <div v-else-if="usage" class="space-y-6 text-sm">
      <p v-if="!usage.totals.calls" class="text-muted">
        {{ t("mapo.ai.settings.usage.empty") }}
      </p>
      <template v-else>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt class="text-muted">
              {{ t("mapo.ai.settings.usage.calls") }}
            </dt>
            <dd class="text-lg font-semibold">
              {{ numbers.format(usage.totals.calls) }}
            </dd>
            <dd class="text-xs text-muted">
              {{
                t("mapo.ai.settings.usage.outcomesLine", {
                  answered: usage.totals.answered,
                  refused: usage.totals.refused,
                  failed: usage.totals.failed,
                })
              }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t("mapo.ai.settings.usage.inputTokens") }}
            </dt>
            <dd class="text-lg font-semibold">
              {{ numbers.format(usage.totals.inputTokens) }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t("mapo.ai.settings.usage.outputTokens") }}
            </dt>
            <dd class="text-lg font-semibold">
              {{ numbers.format(usage.totals.outputTokens) }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t("mapo.ai.settings.usage.cost") }}
            </dt>
            <dd class="text-lg font-semibold">
              {{ costText(usage.totals) }}
            </dd>
          </div>
        </dl>
        <p v-if="hasUnpriced" class="text-xs text-muted">
          {{
            t("mapo.ai.settings.usage.unpriced", {
              n: usage.totals.unpricedCalls,
            })
          }}
        </p>
        <UAlert
          v-if="usage.truncated"
          color="warning"
          variant="subtle"
          :title="t('mapo.ai.settings.usage.truncated')"
        />

        <section v-if="usage.byUser?.length" class="space-y-2">
          <h3 class="font-semibold">
            {{ t("mapo.ai.settings.usage.byUser") }}
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="text-left text-muted">
                <tr>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.user") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.calls") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.tokens") }}
                  </th>
                  <th class="py-1 font-medium">
                    {{ t("mapo.ai.settings.usage.cost") }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in usage.byUser"
                  :key="row.user.id"
                  class="border-t border-default"
                >
                  <td class="py-1 pr-3">
                    {{ row.user.username ?? row.user.id }}
                  </td>
                  <td class="py-1 pr-3">{{ numbers.format(row.calls) }}</td>
                  <td class="py-1 pr-3">{{ tokensText(row) }}</td>
                  <td class="py-1">{{ costText(row) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="font-semibold">
            {{ t("mapo.ai.settings.usage.byModel") }}
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="text-left text-muted">
                <tr>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.model") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.calls") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.tokens") }}
                  </th>
                  <th class="py-1 font-medium">
                    {{ t("mapo.ai.settings.usage.cost") }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in usage.byModel"
                  :key="`${row.provider}/${row.model}`"
                  class="border-t border-default"
                >
                  <td class="py-1 pr-3">
                    {{ row.provider }} · {{ row.model }}
                  </td>
                  <td class="py-1 pr-3">{{ numbers.format(row.calls) }}</td>
                  <td class="py-1 pr-3">{{ tokensText(row) }}</td>
                  <td class="py-1">{{ costText(row) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="font-semibold">
            {{ t("mapo.ai.settings.usage.byDay") }}
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="text-left text-muted">
                <tr>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.day") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.calls") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.tokens") }}
                  </th>
                  <th class="py-1 font-medium">
                    {{ t("mapo.ai.settings.usage.cost") }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in usage.byDay"
                  :key="row.day"
                  class="border-t border-default"
                >
                  <td class="py-1 pr-3">{{ row.day }}</td>
                  <td class="py-1 pr-3">{{ numbers.format(row.calls) }}</td>
                  <td class="py-1 pr-3">{{ tokensText(row) }}</td>
                  <td class="py-1">{{ costText(row) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="font-semibold">
            {{ t("mapo.ai.settings.usage.recent") }}
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="text-left text-muted">
                <tr>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.when") }}
                  </th>
                  <th v-if="scope === 'all'" class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.user") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.task") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.model") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.outcome") }}
                  </th>
                  <th class="py-1 pr-3 font-medium">
                    {{ t("mapo.ai.settings.usage.tokens") }}
                  </th>
                  <th class="py-1 font-medium">
                    {{ t("mapo.ai.settings.usage.cost") }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(call, index) in usage.recent"
                  :key="`${index}-${call.at}`"
                  class="border-t border-default align-top"
                >
                  <td class="py-1 pr-3">
                    {{ new Date(call.at).toLocaleString() }}
                  </td>
                  <td v-if="scope === 'all'" class="py-1 pr-3">
                    {{ call.user.username ?? call.user.id }}
                  </td>
                  <td class="py-1 pr-3">
                    {{ t(`mapo.ai.settings.usage.tasks.${call.task}`) }}
                    <span v-if="call.entities.length" class="text-muted">
                      · {{ call.entities.join(", ") }}
                    </span>
                  </td>
                  <td class="py-1 pr-3">
                    {{ call.provider }} · {{ call.model }}
                  </td>
                  <td class="py-1 pr-3">{{ outcomeText(call) }}</td>
                  <td class="py-1 pr-3">{{ callTokens(call) }}</td>
                  <td class="py-1">{{ costText(call) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
    <p v-else-if="loading" class="text-sm text-muted">
      {{ t("mapo.ai.settings.loading") }}
    </p>
  </UCard>
</template>

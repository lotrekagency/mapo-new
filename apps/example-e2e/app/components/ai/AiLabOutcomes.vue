<script setup lang="ts">
// What came back from the AI, field by field, as useMapoAiFill() planned
// it: the AI labs show it under their panels (AiOllamaPanel.vue for the
// local models, AiCloudPanel.vue for OpenAI and Anthropic). A field of the
// form gets the action the page takes; a list's items and their values get
// what the gateway made of each.
import type { AiFieldOutcome, MapoAiFillField } from "mapomodule/types";

defineProps<{
  /** The fields of the last answer, as `useMapoAiFill().fields` holds them. */
  fields: readonly MapoAiFillField[];
}>();

type BadgeColor = "success" | "warning" | "info" | "error" | "neutral";

const ACTIONS: Record<
  MapoAiFillField["action"],
  { label: string; color: BadgeColor }
> = {
  apply: { label: "verified", color: "success" },
  confirm: { label: "to confirm", color: "warning" },
  manual: { label: "by hand", color: "info" },
  unchanged: { label: "already held", color: "neutral" },
  discard: { label: "discarded", color: "error" },
  empty: { label: "not given", color: "neutral" },
};

/** What the gateway made of a value inside a list's item. */
const OUTCOMES: Record<string, { label: string; color: BadgeColor }> = {
  verified: { label: "verified", color: "success" },
  unverified: { label: "no proof", color: "warning" },
  discarded: { label: "discarded", color: "error" },
  empty: { label: "not given", color: "neutral" },
};

/** An item of a list: all its values proved, or something to check. */
const ITEMS: Record<string, { label: string; color: BadgeColor }> = {
  verified: { label: "item: verified", color: "success" },
  unverified: { label: "item: to check", color: "warning" },
};

/** A row of the table: a field of the form, an item of a list, or a field of an item. */
interface OutcomeRow {
  path: string;
  /** How deep in the lists: 0 for a field of the form. */
  depth: number;
  badge: { label: string; color: BadgeColor };
  /** The AI's value is in the form: only for a field of the form. */
  applied?: boolean;
  value: string;
  quote: string;
  /** The answer gives something: a value, an item, or a value it discarded. */
  given: boolean;
}

function valueOf(outcome: AiFieldOutcome): string {
  if (outcome.status === "filled") {
    const items = outcome.items?.length;
    return items === undefined
      ? JSON.stringify(outcome.value)
      : `${items} item${items === 1 ? "" : "s"}`;
  }
  if (outcome.status === "discarded") {
    return `${JSON.stringify(outcome.proposed)} (${outcome.reason})`;
  }
  return "";
}

function quoteOf(outcome: AiFieldOutcome): string {
  if (outcome.status === "empty") return "";
  if (outcome.status === "filled" && outcome.items) return "";
  const quote = outcome.quotes[0];
  if (!quote) return "no quote";
  return `“${quote.quote}”${quote.found ? "" : " (not in the source)"}`;
}

function outcomeBadge(outcome: AiFieldOutcome) {
  if (outcome.status === "empty") return OUTCOMES.empty!;
  if (outcome.status === "discarded") return OUTCOMES.discarded!;
  return outcome.verified ? OUTCOMES.verified! : OUTCOMES.unverified!;
}

/** The items of a list, each followed by its fields, and the items of the lists inside. */
function itemRows(
  path: string,
  outcome: AiFieldOutcome,
  depth: number,
): OutcomeRow[] {
  if (outcome.status !== "filled" || !outcome.items) return [];
  return outcome.items.flatMap((item, index) => {
    const at = `${path}.${index}`;
    const head: OutcomeRow = {
      path: item.template ? `${at} (${item.template})` : at,
      depth,
      badge: item.verified ? ITEMS.verified! : ITEMS.unverified!,
      value: "",
      quote: "",
      given: true,
    };
    const fields = Object.entries(item.fields).flatMap(([key, inner]) => [
      {
        path: `${at}.${key}`,
        depth: depth + 1,
        badge: outcomeBadge(inner),
        value: valueOf(inner),
        quote: quoteOf(inner),
        given: inner.status !== "empty",
      },
      ...itemRows(`${at}.${key}`, inner, depth + 2),
    ]);
    return [head, ...fields];
  });
}

const showEmpty = ref(false);

function rowsOf(fields: readonly MapoAiFillField[]): OutcomeRow[] {
  const rows = fields.flatMap((field) => [
    {
      path: field.path,
      depth: 0,
      badge: ACTIONS[field.action],
      applied: field.applied,
      value: valueOf(field.outcome),
      quote: quoteOf(field.outcome),
      given: field.action !== "empty",
    },
    ...itemRows(field.path, field.outcome, 1),
  ]);
  return showEmpty.value ? rows : rows.filter((row) => row.given);
}
</script>

<template>
  <div v-if="fields.length" class="space-y-1">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium">What came back, field by field</p>
      <USwitch
        v-model="showEmpty"
        size="xs"
        label="Show the fields not given"
      />
    </div>
    <p class="text-xs text-muted">
      A list goes into the form whole: its row says what the page does with it,
      the rows below what the gateway made of each item and each value.
    </p>
    <table class="w-full text-left text-xs">
      <thead class="text-muted">
        <tr>
          <th class="py-1 pr-2 font-normal">Field</th>
          <th class="py-1 pr-2 font-normal">Outcome</th>
          <th class="py-1 pr-2 font-normal">Value</th>
          <th class="py-1 font-normal">Quote</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="row in rowsOf(fields)" :key="row.path">
          <td
            class="py-1 pr-2 align-top"
            :style="{ paddingLeft: `${row.depth}rem` }"
          >
            <code>{{ row.path }}</code>
          </td>
          <td class="py-1 pr-2 align-top whitespace-nowrap">
            <UBadge size="sm" variant="subtle" :color="row.badge.color">
              {{ row.badge.label }}
            </UBadge>
            <span v-if="row.applied" class="ml-1 text-success">in</span>
          </td>
          <td class="max-w-64 truncate py-1 pr-2 align-top font-mono">
            {{ row.value }}
          </td>
          <td class="max-w-64 truncate py-1 align-top">
            {{ row.quote }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
/**
 * The rules of verification, as the admins set them: each one follows the
 * app's value, or takes the admins' own. A rule less prudent than the
 * app's or Mapo's default shows a warning; the gateway's audit names it
 * too. No rule
 * verifies a value without a quote found in the source.
 */
import { computed, ref, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
} from "../shared/gateway";
import type { AiVerificationRules } from "../shared/sanitize";
import { looserRules } from "../shared/settings";

type RuleName = keyof AiVerificationRules;

const props = defineProps<{
  /** The settings, as the gateway answers them. */
  settings: MapoAiSettingsAnswer;
  /** Saves a change: resolves with why it failed, or nothing. */
  save: (change: MapoAiSettingsInput) => Promise<string | undefined>;
}>();

/** The rules, in the order the page shows them. */
const RULES: readonly RuleName[] = [
  "dateYear",
  "bareHours",
  "timeZones",
  "oneWordQuotes",
  "richTextLinks",
  "soleNumber",
];
/** The choice that follows the app's value. */
const FOLLOW_APP = "app";

const { t } = useSettingsClient();
/** Each rule's choice: `app`, or the value as text. */
const draft = ref<Record<RuleName, string>>(choicesOf({}));
const busy = shallowRef(false);
const notice = shallowRef<{ color: "success" | "error"; text: string }>();

watch(
  () => props.settings.verification.admin,
  (admin) => {
    draft.value = choicesOf(admin);
  },
  { immediate: true },
);

function choicesOf(
  admin: Partial<AiVerificationRules>,
): Record<RuleName, string> {
  const choices = {} as Record<RuleName, string>;
  for (const name of RULES) {
    const value = admin[name];
    choices[name] = value === undefined ? FOLLOW_APP : String(value);
  }
  return choices;
}

/** The rules the admins set, from the choices. */
const chosen = computed((): Partial<AiVerificationRules> => {
  const rules: Partial<AiVerificationRules> = {};
  for (const name of RULES) {
    const choice = draft.value[name];
    if (choice === FOLLOW_APP) continue;
    if (name === "oneWordQuotes") {
      rules.oneWordQuotes = choice === "never" ? "never" : "unique";
    } else {
      rules[name] = choice === "true";
    }
  }
  return rules;
});

/** Less prudent than Mapo's defaults, or than the app's rules they override. */
const looser = computed(() =>
  looserRules(chosen.value, [
    props.settings.verification.mapo,
    props.settings.verification.app,
  ]),
);

function valueText(name: RuleName, value: boolean | string): string {
  if (name === "oneWordQuotes") {
    return t(`mapo.ai.settings.behaviour.rules.oneWordQuotes.${value}`);
  }
  return value
    ? t("mapo.ai.settings.behaviour.on")
    : t("mapo.ai.settings.behaviour.off");
}

function itemsOf(name: RuleName) {
  const app = props.settings.verification.app[name];
  const values =
    name === "oneWordQuotes" ? ["unique", "never"] : ["true", "false"];
  return [
    {
      label: t("mapo.ai.settings.behaviour.appDefault", {
        value: valueText(name, app),
      }),
      value: FOLLOW_APP,
    },
    ...values.map((value) => ({
      label: valueText(
        name,
        name === "oneWordQuotes" ? value : value === "true",
      ),
      value,
    })),
  ];
}

async function submit(): Promise<void> {
  busy.value = true;
  const failed = await props.save({ verification: { ...chosen.value } });
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
        {{ t("mapo.ai.settings.behaviour.rules.title") }}
      </h3>
      <p class="text-sm text-muted">
        {{ t("mapo.ai.settings.behaviour.rules.help") }}
      </p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        v-for="name in RULES"
        :key="name"
        :label="t(`mapo.ai.settings.behaviour.rules.${name}.label`)"
        :help="t(`mapo.ai.settings.behaviour.rules.${name}.help`)"
      >
        <USelect v-model="draft[name]" :items="itemsOf(name)" class="w-full" />
      </UFormField>
    </div>
    <UAlert
      v-if="looser.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="
        t('mapo.ai.settings.behaviour.rules.looser', {
          rules: looser
            .map((name) => t(`mapo.ai.settings.behaviour.rules.${name}.label`))
            .join(', '),
        })
      "
    />
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

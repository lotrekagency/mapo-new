<script setup lang="ts">
/**
 * Saves an assignment of a key, new or changed, in a dialog: for whom
 * (everyone, a group, a user), the provider, the models, the key and
 * whether its users may use their own token. A changed assignment keeps
 * its scope and provider; to move it, remove it and add another.
 */
import { computed, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiKeyAssignment,
  MapoAiKeyAssignmentInput,
  MapoAiKeyProvider,
  MapoAiKeyScope,
} from "../shared/gateway";
import type { MapoAiPrincipal } from "../shared/settings";
import MapoAiSettingsPrincipal from "./MapoAiSettingsPrincipal.vue";

const props = defineProps<{
  /** The providers the app enables. */
  providers: MapoAiKeyProvider[];
  /** Every assignment, to tell the admin what a new one overrides. */
  assignments: MapoAiKeyAssignment[];
  /** The assignment changed; absent for a new one. */
  assignment?: MapoAiKeyAssignment;
}>();

const emit = defineEmits<{
  /** The assignment is saved. */
  saved: [assignment: MapoAiKeyAssignment];
}>();

/** Whether the dialog is open. */
const open = defineModel<boolean>("open", { default: false });

const client = useSettingsClient();
const { t } = client;

const kind = shallowRef<MapoAiKeyScope["kind"]>("group");
const principal = shallowRef<MapoAiPrincipal>();
const providerId = shallowRef("");
const everyModel = shallowRef(true);
const models = shallowRef<string[]>([]);
const key = shallowRef("");
const removeKey = shallowRef(false);
const personalTokens = shallowRef(false);
const saving = shallowRef(false);
const failure = shallowRef<string>();

const isEdit = computed(() => props.assignment !== undefined);
const provider = computed(() =>
  props.providers.find((one) => one.id === providerId.value),
);

/** The form as the assignment, or empty, each time the dialog opens. */
watch(open, (isOpen) => {
  if (!isOpen) return;
  const current = props.assignment;
  const scope = current?.scope;
  kind.value = scope?.kind ?? "group";
  principal.value =
    scope?.kind === "group"
      ? { value: scope.group, label: scope.group }
      : scope?.kind === "user"
        ? { value: scope.user, label: scope.label ?? scope.user }
        : undefined;
  providerId.value = current?.provider ?? props.providers[0]?.id ?? "";
  everyModel.value = !current?.models;
  models.value = [...(current?.models ?? [])];
  key.value = "";
  removeKey.value = false;
  personalTokens.value = current?.personalTokens ?? false;
  failure.value = undefined;
});

watch(kind, () => {
  if (!isEdit.value) principal.value = undefined;
});

const kindItems = computed(() => [
  { label: t("mapo.ai.settings.scope.all"), value: "all" },
  { label: t("mapo.ai.settings.scope.anyGroup"), value: "group" },
  { label: t("mapo.ai.settings.scope.anyUser"), value: "user" },
]);
const providerItems = computed(() =>
  props.providers.map((one) => ({
    label: one.label ?? one.id,
    value: one.id,
  })),
);

function toggleModel(model: string, isOn: boolean | "indeterminate") {
  models.value =
    isOn === true
      ? [...models.value, model]
      : models.value.filter((one) => one !== model);
}

/**
 * The group assignments of the same provider that narrow the models: an
 * assignment for one user with every model opens them all to that user,
 * whatever their groups say, since the nearest assignment decides.
 */
const narrowingGroups = computed(() =>
  kind.value === "user" && everyModel.value
    ? props.assignments.filter(
        (one) =>
          one.scope.kind === "group" &&
          one.provider === providerId.value &&
          one.models !== undefined,
      )
    : [],
);

function useModelsOf(assignment: MapoAiKeyAssignment) {
  everyModel.value = false;
  models.value = [...(assignment.models ?? [])];
}

function groupOf(assignment: MapoAiKeyAssignment): string {
  return assignment.scope.kind === "group" ? assignment.scope.group : "";
}

const canSave = computed(
  () =>
    !saving.value &&
    providerId.value !== "" &&
    (kind.value === "all" || principal.value !== undefined),
);

function scopeOf(): MapoAiKeyScope {
  const chosen = principal.value;
  if (kind.value === "all" || !chosen) return { kind: "all" };
  return kind.value === "group"
    ? { kind: "group", group: chosen.value }
    : { kind: "user", user: chosen.value, label: chosen.label };
}

async function save() {
  const takesKey = provider.value?.key !== undefined;
  const body: MapoAiKeyAssignmentInput = {
    scope: scopeOf(),
    provider: providerId.value,
    models: everyModel.value ? null : [...models.value],
    ...(takesKey ? { personalTokens: personalTokens.value } : {}),
    ...(takesKey && removeKey.value
      ? { key: null }
      : takesKey && key.value.trim()
        ? { key: key.value.trim() }
        : {}),
  };
  saving.value = true;
  try {
    const saved = await client.call<MapoAiKeyAssignment>("/_mapo/ai/keys", {
      method: "PUT",
      body,
    });
    key.value = "";
    open.value = false;
    emit("saved", saved);
  } catch (error) {
    failure.value = client.failureOf(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="
      isEdit
        ? t('mapo.ai.settings.assignment.edit')
        : t('mapo.ai.settings.assignment.add')
    "
  >
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('mapo.ai.settings.assignment.for')">
          <USelect
            v-model="kind"
            :items="kindItems"
            :disabled="isEdit"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="kind !== 'all'"
          :label="
            kind === 'group'
              ? t('mapo.ai.settings.assignment.group')
              : t('mapo.ai.settings.assignment.user')
          "
        >
          <MapoAiSettingsPrincipal
            v-model="principal"
            :kind="kind"
            :disabled="isEdit"
          />
        </UFormField>
        <UFormField :label="t('mapo.ai.settings.assignment.provider')">
          <USelect
            v-model="providerId"
            :items="providerItems"
            :disabled="isEdit"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('mapo.ai.settings.assignment.models')">
          <div class="space-y-1">
            <UCheckbox
              v-model="everyModel"
              :label="t('mapo.ai.settings.assignment.everyModel')"
            />
            <template v-if="!everyModel && provider">
              <UCheckbox
                v-for="model in provider.models"
                :key="model"
                :model-value="models.includes(model)"
                :label="model"
                @update:model-value="toggleModel(model, $event)"
              />
              <p v-if="!models.length" class="text-xs text-muted">
                {{ t("mapo.ai.settings.assignment.closed") }}
              </p>
            </template>
          </div>
        </UFormField>
        <UAlert
          v-if="narrowingGroups.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('mapo.ai.settings.assignment.widens')"
        >
          <template #description>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                v-for="one in narrowingGroups"
                :key="one.id"
                size="xs"
                color="neutral"
                variant="outline"
                @click="useModelsOf(one)"
              >
                {{
                  t("mapo.ai.settings.assignment.useModelsOf", {
                    group: groupOf(one),
                  })
                }}
              </UButton>
            </div>
          </template>
        </UAlert>
        <template v-if="provider?.key">
          <UFormField
            :label="t('mapo.ai.settings.assignment.key')"
            :help="
              assignment?.key
                ? t('mapo.ai.settings.assignment.keyKept')
                : t('mapo.ai.settings.assignment.keyNext')
            "
          >
            <UInput
              v-model="key"
              type="password"
              autocomplete="off"
              :disabled="removeKey"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-if="assignment?.key"
            v-model="removeKey"
            :label="t('mapo.ai.settings.assignment.removeKey')"
          />
          <UCheckbox
            v-model="personalTokens"
            :label="t('mapo.ai.settings.assignment.personalTokens')"
            :description="t('mapo.ai.settings.assignment.personalTokensHelp')"
          />
        </template>
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          :title="failure"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          {{ t("mapo.cancel") }}
        </UButton>
        <UButton :loading="saving" :disabled="!canSave" @click="save()">
          {{ t("mapo.save") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

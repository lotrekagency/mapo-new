<script setup lang="ts">
/**
 * The admins' part of the AI settings: the keys assigned to everyone, a
 * group or a user, with the models they open and whether their users may
 * use their own token; the order of the groups, which decides for a user
 * in several; and the tokens the users saved, which an admin can remove.
 */
import { computed, onMounted, shallowRef } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiKeyAssignment,
  MapoAiKeysAnswer,
  MapoAiSavedToken,
} from "../shared/gateway";
import MapoAiSettingsAssignment from "./MapoAiSettingsAssignment.vue";

const emit = defineEmits<{
  /** The keys changed: what the admin gets may change too. */
  changed: [];
}>();

const client = useSettingsClient();
const { t } = client;
const keys = shallowRef<MapoAiKeysAnswer>();
const notice = shallowRef<{ color: "success" | "error"; text: string }>();
const busy = shallowRef(false);
const editing = shallowRef<MapoAiKeyAssignment>();
const editorOpen = shallowRef(false);
const order = shallowRef<string[]>([]);

async function load(): Promise<void> {
  try {
    const answer = await client.call<MapoAiKeysAnswer>("/_mapo/ai/keys");
    keys.value = answer;
    order.value = groupsInOrder(answer);
  } catch (error) {
    notice.value = { color: "error", text: client.failureOf(error) };
  }
}

onMounted(load);

/**
 * The groups of the assignments, in the admins' order, then the others by
 * name: how the chain ranks them.
 */
function groupsInOrder(answer: MapoAiKeysAnswer): string[] {
  const named = answer.assignments.flatMap((one) =>
    one.scope.kind === "group" ? [one.scope.group] : [],
  );
  const ordered = answer.groups.filter((group) => named.includes(group));
  const others = [...new Set(named)]
    .filter((group) => !ordered.includes(group))
    .sort();
  return [...ordered, ...others];
}

const providerLabel = (id: string) =>
  keys.value?.providers.find((one) => one.id === id)?.label ?? id;

function scopeText(assignment: MapoAiKeyAssignment): string {
  const { scope } = assignment;
  if (scope.kind === "all") return t("mapo.ai.settings.scope.all");
  return scope.kind === "group"
    ? t("mapo.ai.settings.scope.group", { group: scope.group })
    : t("mapo.ai.settings.scope.user", { user: scope.label ?? scope.user });
}

function modelsText(assignment: MapoAiKeyAssignment): string {
  if (!assignment.models) return t("mapo.ai.settings.assignment.everyModel");
  return assignment.models.length
    ? assignment.models.join(", ")
    : t("mapo.ai.settings.assignment.closedShort");
}

function keyText(assignment: MapoAiKeyAssignment): string {
  if (!assignment.key) return t("mapo.ai.settings.assignment.noKey");
  return assignment.key.last4
    ? t("mapo.ai.settings.key.ending", { last4: assignment.key.last4 })
    : t("mapo.ai.settings.assignment.shortKey");
}

function tokenOwner(token: MapoAiSavedToken): string {
  return token.user.username ?? token.user.id;
}

function edit(assignment?: MapoAiKeyAssignment) {
  editing.value = assignment;
  editorOpen.value = true;
}

async function act(done: string, change: () => Promise<unknown>) {
  busy.value = true;
  try {
    await change();
    notice.value = { color: "success", text: done };
    await load();
    emit("changed");
  } catch (error) {
    notice.value = { color: "error", text: client.failureOf(error) };
  } finally {
    busy.value = false;
  }
}

async function onSaved() {
  notice.value = {
    color: "success",
    text: t("mapo.ai.settings.assignment.savedNotice"),
  };
  await load();
  emit("changed");
}

function remove(assignment: MapoAiKeyAssignment) {
  return act(t("mapo.ai.settings.assignment.removedNotice"), () =>
    client.call(`/_mapo/ai/keys/${assignment.id}`, { method: "DELETE" }),
  );
}

function move(index: number, by: -1 | 1) {
  const groups = [...order.value];
  const [group] = groups.splice(index, 1);
  if (group === undefined) return;
  groups.splice(index + by, 0, group);
  order.value = groups;
}

const isOrderChanged = computed(() => {
  const saved = keys.value ? groupsInOrder(keys.value) : [];
  return saved.join("\n") !== order.value.join("\n");
});

function saveOrder() {
  return act(t("mapo.ai.settings.groups.savedNotice"), () =>
    client.call("/_mapo/ai/keys/groups", {
      method: "PUT",
      body: { groups: order.value },
    }),
  );
}

function revoke(token: MapoAiSavedToken) {
  return act(t("mapo.ai.settings.tokens.removedNotice"), () =>
    client.call("/_mapo/ai/token", {
      method: "DELETE",
      query: { provider: token.provider, user: token.user.id },
    }),
  );
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold text-highlighted">
            {{ t("mapo.ai.settings.admin.title") }}
          </h2>
          <p class="text-sm text-muted">
            {{ t("mapo.ai.settings.admin.intro") }}
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          :disabled="!keys?.providers.length"
          @click="edit()"
        >
          {{ t("mapo.ai.settings.assignment.add") }}
        </UButton>
      </div>
    </template>

    <div v-if="keys" class="space-y-6">
      <p v-if="!keys.assignments.length" class="text-sm text-muted">
        {{ t("mapo.ai.settings.admin.empty") }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr>
              <th class="py-2 pr-3 font-medium">
                {{ t("mapo.ai.settings.assignment.for") }}
              </th>
              <th class="py-2 pr-3 font-medium">
                {{ t("mapo.ai.settings.assignment.provider") }}
              </th>
              <th class="py-2 pr-3 font-medium">
                {{ t("mapo.ai.settings.assignment.models") }}
              </th>
              <th class="py-2 pr-3 font-medium">
                {{ t("mapo.ai.settings.assignment.key") }}
              </th>
              <th class="py-2 pr-3 font-medium">
                {{ t("mapo.ai.settings.assignment.tokens") }}
              </th>
              <th class="py-2" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="assignment in keys.assignments"
              :key="assignment.id"
              class="border-t border-default align-top"
            >
              <td class="py-2 pr-3">{{ scopeText(assignment) }}</td>
              <td class="py-2 pr-3">
                {{ providerLabel(assignment.provider) }}
              </td>
              <td class="py-2 pr-3">{{ modelsText(assignment) }}</td>
              <td class="py-2 pr-3">{{ keyText(assignment) }}</td>
              <td class="py-2 pr-3">
                {{
                  assignment.personalTokens
                    ? t("mapo.ai.settings.assignment.tokensAllowed")
                    : t("mapo.ai.settings.assignment.tokensNo")
                }}
              </td>
              <td class="py-2">
                <div class="flex justify-end gap-1">
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-pencil"
                    :aria-label="t('mapo.ai.settings.assignment.edit')"
                    @click="edit(assignment)"
                  />
                  <UButton
                    size="sm"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :aria-label="t('mapo.ai.settings.assignment.remove')"
                    :disabled="busy"
                    @click="remove(assignment)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-if="order.length > 1" class="space-y-2">
        <h3 class="text-sm font-semibold">
          {{ t("mapo.ai.settings.groups.title") }}
        </h3>
        <p class="text-sm text-muted">
          {{ t("mapo.ai.settings.groups.help") }}
        </p>
        <ol class="space-y-1">
          <li
            v-for="(group, index) in order"
            :key="group"
            class="flex items-center gap-2 text-sm"
          >
            <span class="w-6 text-muted">{{ index + 1 }}.</span>
            <span class="flex-1">{{ group }}</span>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up"
              :aria-label="t('mapo.ai.settings.groups.up', { group })"
              :disabled="index === 0"
              @click="move(index, -1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-down"
              :aria-label="t('mapo.ai.settings.groups.down', { group })"
              :disabled="index === order.length - 1"
              @click="move(index, 1)"
            />
          </li>
        </ol>
        <UButton
          size="sm"
          :disabled="busy || !isOrderChanged"
          @click="saveOrder()"
        >
          {{ t("mapo.ai.settings.groups.save") }}
        </UButton>
      </section>

      <section class="space-y-2">
        <h3 class="text-sm font-semibold">
          {{ t("mapo.ai.settings.tokens.title") }}
        </h3>
        <p v-if="!keys.tokens.length" class="text-sm text-muted">
          {{ t("mapo.ai.settings.tokens.none") }}
        </p>
        <ul v-else class="space-y-1">
          <li
            v-for="token in keys.tokens"
            :key="`${token.user.id}:${token.provider}`"
            class="flex items-center gap-2 text-sm"
          >
            <span class="flex-1">
              {{ tokenOwner(token) }} · {{ providerLabel(token.provider) }}
              <template v-if="token.last4">
                · {{ t("mapo.ai.settings.key.ending", { last4: token.last4 }) }}
              </template>
            </span>
            <UButton
              size="xs"
              color="error"
              variant="soft"
              :disabled="busy"
              @click="revoke(token)"
            >
              {{ t("mapo.ai.settings.tokens.remove") }}
            </UButton>
          </li>
        </ul>
      </section>
    </div>

    <UAlert
      v-if="notice"
      class="mt-4"
      :color="notice.color"
      variant="subtle"
      :title="notice.text"
    />

    <MapoAiSettingsAssignment
      v-if="keys"
      v-model:open="editorOpen"
      :providers="keys.providers"
      :assignments="keys.assignments"
      :assignment="editing"
      @saved="onSaved"
    />
  </UCard>
</template>

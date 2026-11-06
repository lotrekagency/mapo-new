<script setup lang="ts">
// The AI status: what GET /_mapo/ai/status tells the signed-in user, read as
// it is (docs/modules/ai.md, "The gateway"). The module adds the AI settings
// page by itself (/ai-settings, in the sidebar's footer): there each user
// picks their provider and model, saves their own token where allowed and
// checks the connection, and the AI's admins assign the keys. This page
// shows what those choices change: the providers and models offered, where
// each key comes from, what a request that names nothing calls.
import type { MapoAiKeyStatus, MapoAiStatus } from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  label: "AI status",
  icon: "i-lucide-activity",
  middleware: ["auth"],
});

const { fetch } = useMapoFetch();
const status = ref<MapoAiStatus>();
const failure = ref<string>();
const loading = ref(false);

async function load() {
  loading.value = true;
  failure.value = undefined;
  try {
    status.value = await fetch<MapoAiStatus>("/_mapo/ai/status");
  } catch (error) {
    status.value = undefined;
    const failed = error as {
      statusCode?: number;
      data?: { statusMessage?: string; message?: string };
    };
    const message = failed.data?.statusMessage ?? failed.data?.message ?? "";
    failure.value = `${failed.statusCode ?? "No answer"} ${message}`.trim();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** Where a provider's key comes from, as `status` says it: never the key. */
function keyOf(key: MapoAiKeyStatus): string {
  const last4 = key.last4 ? ` (…${key.last4})` : "";
  switch (key.level) {
    case "personal":
      return `Your own token${last4}`;
    case "user":
      return `Assigned to you${last4}`;
    case "group":
      return `Assigned to the group ${key.group ?? ""}${last4}`;
    case "all":
      return `Assigned to everyone${last4}`;
    case "project":
      return `The project's, from the environment${last4}`;
    case "none":
      return key.required
        ? "None: run refuses this provider"
        : "None, and none is needed";
  }
}

/** The user's own token for a provider. */
function tokenOf(key: MapoAiKeyStatus): string {
  if (!key.personal.allowed) {
    return key.personal.saved ? "Saved, not allowed now" : "Not allowed";
  }
  if (!key.personal.saved) return "Allowed, none saved";
  return key.personal.last4 ? `Saved (…${key.personal.last4})` : "Saved";
}

/** Whether a model is what a request that names nothing calls. */
function isDefault(provider: string, model: string): boolean {
  const defaults = status.value?.default;
  if (!defaults || defaults.provider !== provider) return false;
  return defaults.models.fill === model || defaults.models.extract === model;
}

/** Whether the user's saved preference is what applies now. */
const preferenceApplies = computed(() => {
  const preference = status.value?.preference;
  const defaults = status.value?.default;
  if (!preference || !defaults) return false;
  const sameProvider = preference.provider === defaults.provider;
  const sameModel = preference.model === defaults.models.fill;
  return sameProvider && sameModel;
});

/** A size in bytes, for people. */
function bytes(value: number): string {
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}
</script>

<template>
  <div class="p-4 max-w-5xl mx-auto space-y-4">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-sparkles"
      title="What the AI offers you"
      description="GET /_mapo/ai/status, read as it is. Choose your provider and model, save your own token and check the connection on the AI settings page; the AI's admins (the admin account) assign keys and models there. Sign in as admin, editor, writer or viewer to compare."
    >
      <template #actions>
        <UButton to="/ai-settings" size="sm" icon="i-lucide-settings">
          AI settings
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="load"
        >
          Read again
        </UButton>
      </template>
    </UAlert>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :title="`status: ${failure}`"
    />

    <template v-if="status">
      <UAlert
        v-if="!status.allowed"
        color="warning"
        variant="subtle"
        title="The app keeps this account out of the AI"
      />

      <UCard v-if="status.allowed">
        <template #header>
          <h2 class="font-semibold">Providers and models</h2>
        </template>
        <p v-if="!status.providers?.length" class="text-sm text-muted">
          No provider is enabled for you: mapo.ai.providers enables none, or the
          admins closed every model to you.
        </p>
        <table v-else class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr>
              <th class="py-1 pr-3">Provider</th>
              <th class="py-1 pr-3">Models, the provider's default first</th>
              <th class="py-1 pr-3">Key in use</th>
              <th class="py-1">Your own token</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="provider in status.providers"
              :key="provider.id"
              class="border-t border-default align-top"
            >
              <td class="py-2 pr-3">
                <div class="font-medium">
                  {{ provider.label ?? provider.id }}
                </div>
                <div class="text-xs text-muted">{{ provider.id }}</div>
              </td>
              <td class="py-2 pr-3">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="model in provider.models"
                    :key="model"
                    :color="
                      isDefault(provider.id, model) ? 'primary' : 'neutral'
                    "
                    :variant="
                      isDefault(provider.id, model) ? 'solid' : 'subtle'
                    "
                  >
                    {{ model }}
                  </UBadge>
                </div>
              </td>
              <td class="py-2 pr-3">
                {{
                  provider.key ? keyOf(provider.key) : "No key of the gateway"
                }}
              </td>
              <td class="py-2">
                {{ provider.key ? tokenOf(provider.key) : "—" }}
              </td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <UCard v-if="status.allowed">
        <template #header>
          <h2 class="font-semibold">What a request that names nothing calls</h2>
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted">Provider</dt>
          <dd>{{ status.default?.provider ?? "None: run answers 503" }}</dd>
          <dt class="text-muted">Model to fill a record</dt>
          <dd>{{ status.default?.models.fill ?? "—" }}</dd>
          <dt class="text-muted">Model to extract records</dt>
          <dd>{{ status.default?.models.extract ?? "—" }}</dd>
          <dt class="text-muted">Your preference</dt>
          <dd>
            <template v-if="status.preference">
              {{ status.preference.provider }} /
              {{ status.preference.model }}
              <span class="text-muted">
                ({{
                  preferenceApplies
                    ? "applies"
                    : "saved, but closed to you or without a key now: the app's default applies"
                }})
              </span>
            </template>
            <template v-else>None: the app's default applies</template>
          </dd>
        </dl>
      </UCard>

      <UCard v-if="status.allowed && status.limits">
        <template #header>
          <h2 class="font-semibold">Limits and files</h2>
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted">Calls to run per minute</dt>
          <dd>{{ status.limits.perUserPerMinute }}</dd>
          <dt class="text-muted">Characters of a source</dt>
          <dd>{{ status.limits.maxSourceChars.toLocaleString() }}</dd>
          <dt class="text-muted">Characters of your instructions</dt>
          <dd>{{ status.limits.maxInstructionsChars.toLocaleString() }}</dd>
          <dt class="text-muted">Size of a file</dt>
          <dd>{{ bytes(status.limits.maxFileBytes) }}</dd>
          <dt class="text-muted">Formats read</dt>
          <dd>
            {{
              status.readers?.length
                ? status.readers
                    .map((reader) => reader.label ?? reader.id)
                    .join(", ")
                : "None"
            }}
          </dd>
        </dl>
      </UCard>

      <UCard v-if="status.storage">
        <template #header>
          <h2 class="font-semibold">Storage (AI admins)</h2>
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted">Open</dt>
          <dd>
            {{
              status.storage.open
                ? "Yes"
                : "No: keys and preferences cannot be saved"
            }}
          </dd>
          <dt class="text-muted">NUXT_MAPO_AI_SECRET</dt>
          <dd>{{ status.storage.secret }}</dd>
          <dt class="text-muted">Driver</dt>
          <dd>
            {{
              status.storage.mounted
                ? (status.storage.driver ?? "mounted")
                : "Not mounted"
            }}
          </dd>
        </dl>
      </UCard>

      <details class="text-sm">
        <summary class="cursor-pointer text-muted">The answer as JSON</summary>
        <pre class="mt-2 p-3 rounded bg-elevated overflow-x-auto">{{
          JSON.stringify(status, null, 2)
        }}</pre>
      </details>
    </template>
  </div>
</template>

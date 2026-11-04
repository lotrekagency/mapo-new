<script setup lang="ts">
// Tests: GET /_mapo/ai/status of @mapomodule/ai, for the signed-in user.
// - admin: a superuser, so the AI's admin, who also sees the storage;
// - editor: uses the AI, with the provider, the models and the limits;
// - viewer: kept out by the app's mapo-ai:user hook
//   (server/plugins/mapo-ai-rules.ts), so `allowed` is false.
// Without a session the route answers 401.
import type { MapoAiStatus } from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  label: "AI gateway",
  icon: "i-lucide-sparkles",
  middleware: ["auth"],
});

const { fetch } = useMapoFetch();
const {
  data: status,
  error,
  refresh,
  pending,
} = useAsyncData(
  "mapo-ai-status",
  () => fetch<MapoAiStatus>("/_mapo/ai/status"),
  { server: false },
);

const rows = computed(() => {
  const value = status.value;
  if (!value) return [];
  const yesNo = (flag: boolean) => (flag ? "yes" : "no");
  return [
    { label: "Contract", value: String(value.contract) },
    { label: "Allowed", value: yesNo(value.allowed) },
    { label: "Admin", value: yesNo(value.admin) },
    {
      label: "Providers",
      value:
        value.providers
          ?.map((provider) => `${provider.id} (${provider.models.join(", ")})`)
          .join("; ") ?? "—",
    },
    {
      label: "Default",
      value: value.default
        ? `${value.default.provider}: fill ${value.default.models.fill}, extract ${value.default.models.extract}`
        : "—",
    },
    {
      label: "Limits",
      value: value.limits
        ? `${value.limits.perUserPerMinute} calls a minute, ${value.limits.maxSourceChars} characters of source, ${value.limits.maxInstructionsChars} of instructions`
        : "—",
    },
    {
      label: "Storage",
      value: value.storage
        ? `${value.storage.open ? "open" : "closed"}, secret ${value.storage.secret}, ${value.storage.mounted ? `mounted (${value.storage.driver ?? "driver"})` : "not mounted"}`
        : "only for the AI's admins",
    },
  ];
});
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto space-y-3">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-sparkles"
      title="The AI gateway, as it sees you"
      description="GET /_mapo/ai/status. Sign in as admin, editor or viewer to see what changes; /ai/fill/new fills an article through run."
    />
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="`The gateway answered ${error.statusCode ?? 'with an error'}`"
    />
    <UCard v-if="status">
      <dl class="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <template v-for="row in rows" :key="row.label">
          <dt class="text-muted">{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
    </UCard>
    <UButton
      color="neutral"
      variant="soft"
      icon="i-lucide-refresh-cw"
      :loading="pending"
      @click="refresh()"
    >
      Ask again
    </UButton>
  </div>
</template>

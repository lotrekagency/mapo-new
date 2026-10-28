<script setup lang="ts">
// A detail extension placed in "body-top", above the form: it reads the
// context the detail shares, and the OPTIONS response the detail asked for.
const detail = useMapoDetail();

/** How many fields the OPTIONS response describes; null until it answers. */
const described = ref<number | null>(null);

onMounted(async () => {
  const metadata = await detail?.metadata();
  const actions = metadata?.actions;
  const post =
    typeof actions === "object" && actions !== null
      ? (actions as Record<string, unknown>).POST
      : undefined;
  described.value =
    typeof post === "object" && post !== null ? Object.keys(post).length : 0;
});
</script>

<template>
  <UAlert
    v-if="detail"
    color="neutral"
    variant="subtle"
    icon="i-lucide-plug"
    title="Read from useMapoDetail()"
  >
    <template #description>
      <ul class="space-y-0.5 text-xs">
        <li>
          Endpoint <code>{{ detail.endpoint.value }}</code> · id
          <code>{{ detail.id.value }}</code> · new:
          {{ detail.isNew.value ? "yes" : "no" }}
        </li>
        <li>
          Fields: {{ detail.fields.value.length }} in the body,
          {{ detail.sidebarFields.value.length }} in the sidebar
        </li>
        <li>
          Unsaved changes: {{ detail.isDirty.value ? "yes" : "no" }} ·
          read-only: {{ detail.readonly.value ? "yes" : "no" }}
        </li>
        <li>
          OPTIONS, asked once and shared:
          {{ described === null ? "…" : `${described} fields in actions.POST` }}
        </li>
      </ul>
    </template>
  </UAlert>
</template>

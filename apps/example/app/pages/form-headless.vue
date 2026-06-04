<script setup lang="ts">
import { ref } from "vue";

definePageMeta({
  label: "Form Headless",
  icon: "i-lucide-cpu",
  layout: "mapo-default",
});

// useMapoForm senza <MapoForm> — layout completamente custom

const model = ref({ username: "", email: "", role: "editor", notify: true });
const errors = ref<Record<string, string[]>>({});
const { $mapoFormRegistry } = useNuxtApp();

const fields = ref([
  {
    key: "username",
    type: "text" as const,
    label: "Username",
    required: true,
    validate: (v: unknown) =>
      String(v).length >= 3 ? null : "Minimo 3 caratteri",
  },
  {
    key: "email",
    type: "text" as const,
    label: "Email",
    required: true,
    validate: (v: unknown) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? null : "Email non valida",
  },
  {
    key: "role",
    type: "select" as const,
    label: "Ruolo",
    attrs: {
      options: [
        { text: "Admin", value: "admin" },
        { text: "Editor", value: "editor" },
        { text: "Viewer", value: "viewer" },
      ],
    },
  },
  { key: "notify", type: "switch" as const, label: "Notifiche email" },
]);

const form = useMapoForm({
  model,
  fields,
  errors,
  registry: $mapoFormRegistry,
  immediate: true,
});

async function save() {
  await form.submit(async (data) => {
    await new Promise((r) => setTimeout(r, 400));
    useSnackStore().show("Utente salvato", "success");
  });
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 p-6">
    <h1 class="text-2xl font-bold">Form Headless</h1>
    <p class="text-sm text-gray-500">
      <code>useMapoForm</code> usato direttamente senza
      <code>&lt;MapoForm&gt;</code>. Il layout è completamente custom ma i
      field, la validazione e il dirty state vengono tutti dal composable.
    </p>

    <!-- Layout a due colonne custom -->
    <div class="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-6">
      <!-- Ogni MapoFormField si auto-inietta il context fornito da useMapoForm() -->
      <div class="col-span-2">
        <MapoFormField :descriptor="fields[0]" />
      </div>
      <div class="col-span-2">
        <MapoFormField :descriptor="fields[1]" />
      </div>
      <div>
        <MapoFormField :descriptor="fields[2]" />
      </div>
      <div class="flex items-end pb-1">
        <MapoFormField :descriptor="fields[3]" />
      </div>
    </div>

    <div class="flex items-center justify-between">
      <div class="space-y-1 text-sm">
        <div>
          Dirty:
          <UBadge :color="form.isDirty.value ? 'warning' : 'neutral'" size="xs">
            {{ form.isDirty.value ? "sì" : "no" }}
          </UBadge>
        </div>
        <div>
          Patch:
          <code class="rounded bg-gray-100 px-1 text-xs">{{
            JSON.stringify(form.getPatch())
          }}</code>
        </div>
      </div>
      <UButton :loading="form.isLoading.value" @click="save"> Salva </UButton>
    </div>
  </div>
</template>

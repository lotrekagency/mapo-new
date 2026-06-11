<script setup lang="ts">
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({ middleware: ["auth"] });

const route = useRoute();
const router = useRouter();
const idParam = computed(() => route.params.id as string);
const isNew = computed(() => idParam.value === "new");

interface News {
  id?: number;
  title: string | null;
  indexable: boolean;
  autopermalink: boolean;
  keywords: string | null;
  description: string | null;
  status: string;
  publication_date: string | null;
  identifier: string | null;
  ordering: number;
  short_desc: string | null;
  content: string | null;
  template_data: {
    titles?: { title?: string; sub_title?: string };
  } | null;
}

const emptyModel = (): News => ({
  title: "",
  indexable: true,
  autopermalink: true,
  keywords: "",
  description: "",
  status: "DRF",
  publication_date: null,
  identifier: "",
  ordering: 0,
  short_desc: "",
  content: "",
  template_data: { titles: { title: "", sub_title: "" } },
});

const model = ref<News>(emptyModel());
const errors = ref<Record<string, string[]>>({});
const loading = ref(false);
const { $mapoFormRegistry } = useNuxtApp();

const fields: FieldDescriptor<News>[] = [
  {
    key: "title",
    type: "text",
    label: "Title",
    required: true,
    validate: (v: unknown) =>
      String(v ?? "").length >= 2 ? null : "Title is required",
  },
  { key: "identifier", type: "text", label: "Identifier (slug)" },
  { key: "description", type: "textarea", label: "Meta description" },
  { key: "keywords", type: "text", label: "Keywords" },
  { key: "template_data.titles.title", type: "text", label: "Main title" },
  { key: "template_data.titles.sub_title", type: "text", label: "Subtitle" },
  { key: "short_desc", type: "textarea", label: "Excerpt" },
  { key: "content", type: "textarea", label: "Article body" },
];

const sidebarFields: FieldDescriptor<News>[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "DRF" },
        { label: "Published", value: "PUB" },
        { label: "Scheduled", value: "PLA" },
        { label: "Trash", value: "TRS" },
      ],
    },
  },
  { key: "publication_date", type: "date", label: "Publication date" },
  { key: "ordering", type: "number", label: "Order", attrs: { min: 0 } },
  { key: "indexable", type: "switch", label: "Indexable" },
  { key: "autopermalink", type: "switch", label: "Auto permalink" },
];

const ssrHeaders = import.meta.server
  ? useRequestHeaders(["cookie"])
  : undefined;

async function loadItem() {
  if (isNew.value) return;
  loading.value = true;
  try {
    model.value = await $fetch<News>(`/api/models/news/${idParam.value}/`, {
      headers: ssrHeaders,
    });
  } finally {
    loading.value = false;
  }
}
await loadItem();

const form = useMapoForm({
  model,
  fields: [...fields, ...sidebarFields],
  errors,
  registry: $mapoFormRegistry,
});

const snack = ref<{ show: boolean; color: string; text: string }>({
  show: false,
  color: "success",
  text: "",
});

async function save() {
  errors.value = {};
  await form.submit(async (data: News | Partial<News>, creating: boolean) => {
    try {
      if (creating) {
        const created = await $fetch<News>("/api/models/news/", {
          method: "POST",
          body: data,
        });
        snack.value = { show: true, color: "success", text: "Created" };
        await router.replace(`/news/${created.id}`);
      } else {
        await $fetch(`/api/models/news/${idParam.value}/`, {
          method: "PATCH",
          body: data,
        });
        snack.value = { show: true, color: "success", text: "Saved" };
      }
    } catch (e: unknown) {
      const err = e as { data?: Record<string, string[]> };
      if (err?.data && typeof err.data === "object") {
        errors.value = err.data;
      }
      snack.value = { show: true, color: "error", text: "Save failed" };
      throw e;
    }
  }, isNew.value);
}

async function destroy() {
  if (isNew.value) return;
  if (!confirm("Delete this news item?")) return;
  await $fetch(`/api/models/news/${idParam.value}/`, { method: "DELETE" });
  await router.push("/news");
}
</script>

<template>
  <v-row align="center" class="mb-2">
    <v-col>
      <div class="text-caption text-medium-emphasis">
        <NuxtLink to="/news"> News </NuxtLink> /
        {{ isNew ? "new" : `#${idParam}` }}
      </div>
      <h1 class="text-h5">
        {{ isNew ? "New article" : model.title || "Edit" }}
      </h1>
    </v-col>
    <v-col cols="auto">
      <v-btn
        v-if="!isNew"
        variant="tonal"
        color="error"
        prepend-icon="mdi-delete"
        class="mr-2"
        @click="destroy"
      >
        Delete
      </v-btn>
      <v-btn
        color="primary"
        :disabled="!form.isDirty.value && !isNew"
        :loading="form.isLoading.value"
        prepend-icon="mdi-content-save"
        @click="save"
      >
        Save
      </v-btn>
    </v-col>
  </v-row>

  <v-row>
    <v-col cols="12" md="8">
      <v-card>
        <v-card-text>
          <div class="d-flex flex-column ga-4">
            <MapoFormField
              v-for="f in fields"
              :key="f.key as string"
              :descriptor="f"
            />
          </div>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" md="4">
      <v-card>
        <v-card-title class="text-subtitle-1"> Status </v-card-title>
        <v-card-text>
          <div class="d-flex flex-column ga-4">
            <MapoFormField
              v-for="f in sidebarFields"
              :key="f.key as string"
              :descriptor="f"
            />
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mt-3" variant="tonal">
        <v-card-text>
          <div class="text-caption">
            Dirty:
            <v-chip
              size="x-small"
              :color="form.isDirty.value ? 'warning' : 'default'"
            >
              {{ form.isDirty.value ? "yes" : "no" }}
            </v-chip>
          </div>
          <div class="text-caption mt-2">Patch preview:</div>
          <pre
            class="text-caption"
            style="white-space: pre-wrap; word-break: break-all"
            >{{ JSON.stringify(form.getPatch(), null, 2) }}</pre
          >
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <v-snackbar v-model="snack.show" :color="snack.color" timeout="2500">
    {{ snack.text }}
  </v-snackbar>
</template>

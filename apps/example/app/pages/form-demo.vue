<script setup lang="ts">
import { ref, computed } from "vue";
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  label: "Form Demo",
  icon: "i-lucide-layout-list",
  layout: "mapo-default",
});

// ─── Modello articolo (stato locale — nessun backend) ────────────────────────

interface Article {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  category: { id: number; name: string } | null;
  tags: Array<{ id: number; name: string }>;
  published_at: string | null;
  is_draft: boolean;
  rating: number;
  color: string;
  cover_url: string;
  location: { lat: number; lng: number } | null;
  seo: { title: string; description: string; url: string };
  blocks: Array<{
    _template: string;
    title?: string;
    body?: string;
    image_url?: string;
  }>;
  translations: Record<string, Partial<Article>>;
}

const article = ref<Article>({
  title: "",
  slug: "",
  body: "",
  excerpt: "",
  category: null,
  tags: [],
  published_at: null,
  is_draft: true,
  rating: 3,
  color: "#3b82f6",
  cover_url: "",
  location: null,
  seo: { title: "", description: "", url: "" },
  blocks: [],
  translations: {},
});

// Errori simulati da backend per dimostrare il mapping
const errors = ref<Record<string, string[]>>({});

const languages = ["it", "en"];
const currentLang = ref("it");

// ─── Descriptor fields ───────────────────────────────────────────────────────

const fields: FieldDescriptor<Article>[] = [
  // Tab "Contenuto"
  {
    key: "title",
    type: "text",
    label: "Titolo",
    translatable: true,
    required: true,
    tab: "content",
    cols: 8,
  },
  {
    key: "slug",
    type: "text",
    label: "Slug",
    tab: "content",
    cols: 4,
    validate: (v) =>
      v && String(v).includes(" ") ? "Lo slug non può contenere spazi" : null,
  },
  {
    key: "body",
    type: "editor",
    label: "Contenuto",
    translatable: true,
    tab: "content",
  },
  {
    key: "excerpt",
    type: "textarea",
    label: "Estratto",
    translatable: true,
    tab: "content",
    attrs: { maxLength: 300 },
  },

  // Tab "Metadati"
  {
    key: "category",
    type: "fks",
    label: "Categoria",
    tab: "meta",
    attrs: {
      endpoint: "/api/mock/categories",
      itemText: "name",
      returnObject: true,
    },
  },
  {
    key: "tags",
    type: "m2m",
    label: "Tag",
    tab: "meta",
    attrs: {
      endpoint: "/api/mock/tags",
      itemText: "name",
      returnObject: true,
      multiple: true,
    },
  },
  {
    key: "published_at",
    type: "datetime",
    label: "Pubblicato il",
    tab: "meta",
    group: "publishing",
    cols: 6,
  },
  {
    key: "is_draft",
    type: "switch",
    label: "Bozza",
    tab: "meta",
    group: "publishing",
    cols: 6,
  },
  {
    key: "rating",
    type: "slider",
    label: "Rating",
    tab: "meta",
    attrs: { min: 0, max: 5, step: 0.5 },
  },
  { key: "color", type: "color", label: "Colore tema", tab: "meta", cols: 4 },
  {
    key: "cover_url",
    type: "file",
    label: "Immagine copertina",
    tab: "meta",
    cols: 8,
  },
  { key: "location", type: "map", label: "Posizione", tab: "meta" },

  // Tab "SEO" — nested under "meta" tab as a sub-tab (demonstrates C2)
  // tab: ['meta', 'seo'] puts this field in meta > seo sub-tab
  { key: "seo", type: "seo", tab: ["meta", "seo"] },

  // Tab "Blocchi"
  {
    key: "blocks",
    type: "repeater",
    label: "Blocchi contenuto",
    tab: "blocks",
    fields: [{ key: "title", type: "text", label: "Titolo blocco" }],
    attrs: {
      templates: {
        text: [
          { key: "title", type: "text", label: "Titolo" },
          { key: "body", type: "editor", label: "Testo" },
        ],
        image: [
          { key: "title", type: "text", label: "Didascalia" },
          { key: "image_url", type: "text", label: "URL immagine" },
        ],
      },
      previewLabel: (item: any) =>
        item?.title || `(${item?._template ?? "blocco"})`,
      confirmDelete: true,
      allowDuplicate: true,
    },
  },
];

// ─── Registry con $mapoFormRegistry iniettato dal plugin ─────────────────────

const { $mapoFormRegistry } = useNuxtApp();

// ─── Form state ───────────────────────────────────────────────────────────────

const form = useMapoForm({
  model: article,
  fields: computed(() => fields),
  errors,
  languages,
  currentLang,
  registry: $mapoFormRegistry,
});

async function save() {
  await form.submit(async (data, isNew) => {
    // Qui andresti a chiamare useCrud().create() o .partialUpdate()
    await new Promise((r) => setTimeout(r, 600));
    useSnackStore().show(
      `Salvato! (patch: ${JSON.stringify(data)})`,
      "success",
    );
  });
}

function simulateErrors() {
  errors.value = {
    title: ["Il titolo è obbligatorio"],
    "translations.en.title": ["English title is required"],
    "blocks.0.title": ["Il titolo del blocco è obbligatorio"],
  };
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4 p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Form Demo — Articolo</h1>
        <p class="mt-1 text-sm text-gray-500">
          Tutti i tipi di field in un unico form multilingua con tab, group e
          repeater.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Lingua -->
        <div class="flex gap-1">
          <UButton
            v-for="lang in languages"
            :key="lang"
            size="sm"
            :variant="currentLang === lang ? 'solid' : 'outline'"
            @click="currentLang = lang"
          >
            {{ lang.toUpperCase() }}
          </UButton>
        </div>

        <!-- Dirty indicator -->
        <UBadge v-if="form.isDirty.value" color="warning" variant="soft">
          Modifiche non salvate
        </UBadge>

        <UButton
          variant="ghost"
          color="error"
          size="sm"
          @click="simulateErrors"
        >
          Simula errori BE
        </UButton>
        <UButton
          :loading="form.isLoading.value"
          icon="i-lucide-save"
          @click="save"
        >
          Salva
        </UButton>
      </div>
    </div>

    <MapoForm
      v-model="article"
      :fields="fields"
      :errors="errors"
      :languages="languages"
      :current-lang="currentLang"
    >
      <!-- field.*.append — auto-generate slug from title -->
      <template #field.slug.append>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          icon="i-lucide-wand"
          title="Genera da titolo"
          @click="
            article.slug =
              article.title
                ?.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '') ?? ''
          "
        />
      </template>

      <!-- field.*.before — tip injected above the excerpt widget -->
      <template #field.excerpt.before>
        <p class="text-xs text-muted mb-1">
          Mantieni sotto i 160 caratteri per un buon SEO.
        </p>
      </template>

      <!-- field.*.after — live character count below the excerpt widget -->
      <template #field.excerpt.after="{ model }">
        <p
          class="mt-1 text-right text-xs"
          :class="
            (model?.excerpt?.length ?? 0) > 160 ? 'text-error' : 'text-muted'
          "
        >
          {{ model?.excerpt?.length ?? 0 }} / 160
        </p>
      </template>

      <!-- group.*.before — banner above the "publishing" group card -->
      <template #group.publishing.before>
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-calendar"
          title="Pianificazione"
          description="Lascia vuota la data per salvare come bozza senza pubblicazione automatica."
        />
      </template>
    </MapoForm>

    <!-- Debug: stato form corrente -->
    <UCard class="mt-6">
      <template #header>
        <span class="text-sm font-medium text-gray-600"
          >Debug — model corrente</span
        >
      </template>
      <pre class="overflow-auto text-xs text-gray-700">{{
        JSON.stringify(article, null, 2)
      }}</pre>
    </UCard>
  </div>
</template>

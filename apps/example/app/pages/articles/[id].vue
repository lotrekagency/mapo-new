<script setup lang="ts">
/**
 * Pagina di dettaglio articolo — demo completa di MapoDetail.
 *
 * Feature dimostrate:
 *  ✅ Tab semplici          (tab: 'contenuto')
 *  ✅ Tab innestate         (tab: ['seo', 'base'] e tab: 'seo/social' — C2)
 *  ✅ Subtab dentro group   (subtab: 'Base' / 'Social' dentro group: 'seo' — C2)
 *  ✅ Group dentro tab      (group + tab combined)
 *  ✅ flattenFieldGroups    (FieldGroupDescriptor per la sidebar — C3)
 *  ✅ field.*.before/after  (hint sotto slug, counter per excerpt — C1)
 *  ✅ group.*.before/after  (alert sopra il group "visibility" — C1)
 *  ✅ Slot sidebar          (#side-bottom per debug/preview)
 *  ✅ translatable + synci18n (lingue it/en)
 */

import { flattenFieldGroups } from "@mapomodule/form/types";
import type {
  AnyFieldDescriptor,
  FieldDescriptor,
  FieldGroupDescriptor,
} from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
});

const route = useRoute();
const id = computed(() => route.params.id as string);

interface Article {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  status: string;
  is_featured: boolean;
  published_at: string | null;
  priority: number;
  seo_title: string;
  seo_description: string;
  og_title: string;
  og_image: string;
  translations: Record<
    string,
    { title?: string; body?: string; excerpt?: string }
  >;
}

// ─── Campi principali ────────────────────────────────────────────────────────
//
// Struttura tab:
//   "Contenuto"          → title, slug, excerpt, body
//   "SEO" / "Base"       → seo_title, seo_description  (tab: array — C2)
//   "SEO" / "Social"     → og_title, og_image           (tab: slash — C2)
//
// Il group "seo" dentro il tab "SEO/Base" ha subtab interni (subtab: ... — C2).
// Mostra group + nested tabs + subtab inside group tutti insieme.
const mainFields: FieldDescriptor<Article>[] = [
  // ── Tab "Contenuto" ──────────────────────────────────────────────────────
  {
    key: "title",
    type: "text",
    label: "Titolo",
    tab: "contenuto",
    translatable: true,
    required: true,
  },
  {
    key: "slug",
    type: "text",
    label: "Slug",
    tab: "contenuto",
    synci18n: true,
    attrs: { placeholder: "my-article-slug" },
  },
  {
    key: "excerpt",
    type: "textarea",
    label: "Estratto",
    tab: "contenuto",
    translatable: true,
    cols: 12,
    attrs: { rows: 3, placeholder: "Breve descrizione dell'articolo…" },
  },
  {
    key: "body",
    type: "editor",
    label: "Contenuto",
    tab: "contenuto",
    translatable: true,
  },

  // ── Tab annidato "SEO > Base" — forma array (C2) ─────────────────────────
  // tab: ['SEO', 'Base'] crea un sub-tab "Base" dentro il tab "SEO".
  {
    key: "seo_title",
    type: "text",
    label: "SEO Title",
    tab: ["SEO", "Base"],
    group: "meta",
    subtab: "Titolo",
    cols: 12,
    attrs: { placeholder: "Titolo per i motori di ricerca" },
  },
  {
    key: "seo_description",
    type: "textarea",
    label: "SEO Description",
    tab: ["SEO", "Base"],
    group: "meta",
    subtab: "Titolo",
    attrs: {
      rows: 3,
      placeholder: "Descrizione per i motori di ricerca (max 160 car.)",
    },
  },

  // ── Tab annidato "SEO > Social" — forma slash (C2) ───────────────────────
  // tab: 'SEO/Social' è equivalente a tab: ['SEO', 'Social']. Stesso risultato.
  {
    key: "og_title",
    type: "text",
    label: "OG Title",
    tab: "SEO/Social",
    group: "og",
    subtab: "Facebook",
    cols: 12,
  },
  {
    key: "og_image",
    type: "text",
    label: "OG Image URL",
    tab: "SEO/Social",
    group: "og",
    subtab: "Facebook",
    attrs: { placeholder: "https://…" },
  },
];

// ─── Sidebar (flattenFieldGroups — C3) ───────────────────────────────────────
//
// flattenFieldGroups trasforma un albero FieldGroupDescriptor in FieldDescriptor[].
// Il group "visibility" viene propagato a status e is_featured senza ripeterlo
// su ogni campo. I campi flat (priority, published_at) passano invariati.
const sidebarFields: AnyFieldDescriptor<Article>[] =
  flattenFieldGroups<Article>([
    {
      group: "visibility",
      fields: [
        {
          key: "status",
          type: "select",
          label: "Stato",
          synci18n: true,
          attrs: {
            items: [
              { label: "Bozza", value: "draft" },
              { label: "Pubblicato", value: "published" },
              { label: "Archiviato", value: "archived" },
            ],
          },
        },
        {
          key: "is_featured",
          type: "switch",
          label: "In evidenza",
          synci18n: true,
        },
      ],
    } satisfies FieldGroupDescriptor<Article>,
    // Campi flat — passano inalterati (nessun group ereditato)
    {
      key: "priority",
      type: "number",
      label: "Priorità",
      synci18n: true,
      attrs: { min: 1, max: 10 },
    },
    {
      key: "published_at",
      type: "datetime",
      label: "Data pubblicazione",
      synci18n: true,
    },
  ]);
</script>

<template>
  <div class="p-6">
    <MapoDetail
      :id="id"
      endpoint="/api/mock/articles"
      :fields="mainFields"
      :sidebar-fields="sidebarFields"
      :languages="['it', 'en']"
      model-name="Articolo"
    >
      <!--
        ── Slot field.*.after ────────────────────────────────────────────────
        Inietta contenuto dentro la colonna del campo, sotto il widget.
        Riceve { field, model, currentLang }.
      -->

      <!-- Hint sotto lo slug (C1: field.slug.after) -->
      <template #field.slug.after>
        <p class="mt-1 text-xs text-muted">
          Usato come URL dell'articolo. Lascia vuoto per generarlo
          automaticamente.
        </p>
      </template>

      <!-- Counter caratteri per l'estratto (C1: field.excerpt.after) -->
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

      <!-- Hint sopra il seo_title (C1: field.seo_title.before) -->
      <template #field.seo_title.before>
        <p class="mb-1 text-xs text-muted">
          Se vuoto viene usato il titolo dell'articolo.
        </p>
      </template>

      <!--
        ── Slot group.*.before / group.*.after ──────────────────────────────
        Wrappano l'intera group card dall'esterno.
      -->

      <!-- Alert sopra il group "visibility" (C1: group.visibility.before) -->
      <template #group.visibility.before>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-eye"
          title="Visibilità"
          description="Imposta lo stato su 'Pubblicato' per rendere l'articolo visibile."
        />
      </template>

      <!-- Nota sotto il group "meta" (C1: group.meta.after) -->
      <template #group.meta.after>
        <p class="mt-2 text-xs text-muted">
          I meta tag vengono usati dai motori di ricerca per indicizzare
          l'articolo.
        </p>
      </template>

      <!--
        ── Slot sidebar (#side-bottom) ────────────────────────────────────────
        Contenuto extra in fondo alla colonna sidebar sticky.
        Utile per debug, statistiche, link veloci.
      -->
      <template #side-bottom="{ model }">
        <div
          class="rounded-lg border border-default p-3 text-xs text-muted space-y-1"
        >
          <p class="font-medium text-default">Debug model</p>
          <p>
            Status: <strong>{{ model?.status ?? "—" }}</strong>
          </p>
          <p>
            Featured: <strong>{{ model?.is_featured ? "sì" : "no" }}</strong>
          </p>
          <p>
            Priority: <strong>{{ model?.priority ?? "—" }}</strong>
          </p>
        </div>
      </template>
    </MapoDetail>
  </div>
</template>

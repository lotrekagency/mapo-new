<script setup lang="ts">
/**
 * Pagina di test per tutte le feature nuove del form engine.
 * Self-contained: nessun backend richiesto.
 *
 * Feature testate:
 *  1. Layout (griglia 12-col, sidebar destra, group collassabili)
 *  2. Progressive Disclosure DSL (when / matchesField)
 *  3. validateAsync con indicatore visivo
 *  4. Repeater con miniCard (contextual scaling)
 *  5. Focus Mode portal (pulsante ↗ su ogni item repeater)
 *  6. Bulk Actions nel repeater
 *  7. useFormDraft (auto-save localStorage con banner ripristino)
 *  8. Nested tabs — tab: string[] o 'a/b' (C2)
 *  9. flattenFieldGroups — authoring gerarchico (C3)
 */

import { ref } from "vue";
import type {
  FieldDescriptor,
  RepeaterDescriptor,
  FieldGroupDescriptor,
} from "@mapomodule/form/types";
import { flattenFieldGroups } from "@mapomodule/form/types";

definePageMeta({
  label: "Form Test",
  icon: "i-lucide-flask-conical",
  layout: "mapo-default",
});

// ─── Modello ─────────────────────────────────────────────────────────────────

interface TestModel {
  // Sezione 1: layout base
  first_name: string;
  last_name: string;
  email: string;
  bio: string;
  // Sezione 2: progressive disclosure
  has_company: boolean;
  company_name: string;
  company_vat: string;
  role: string;
  // Sezione 3: async validation
  username: string;
  // Sezione 4: repeater con miniCard
  team_members: Array<{
    name: string;
    role: string;
    avatar_color: string;
    active: boolean;
  }>;
  // Sezione 5: tab con groups e nested tabs (C2)
  address: string;
  city: string;
  country: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;
  // Sezione 6: subtab dentro group (C2)
  meta_title: string;
  meta_description: string;
  og_title: string;
  og_image: string;
  // Sezione 7: flattenFieldGroups (C3)
  company_website: string;
  company_email: string;
  billing_address: string;
  billing_city: string;
}

const model = ref<TestModel>({
  first_name: "",
  last_name: "",
  email: "",
  bio: "",
  has_company: false,
  company_name: "",
  company_vat: "",
  role: "viewer",
  username: "",
  team_members: [],
  address: "",
  city: "",
  country: "",
  shipping_address: "",
  shipping_city: "",
  shipping_country: "",
  meta_title: "",
  meta_description: "",
  og_title: "",
  og_image: "",
  company_website: "",
  company_email: "",
  billing_address: "",
  billing_city: "",
});

const errors = ref<Record<string, string[]>>({});
const { $mapoFormRegistry } = useNuxtApp();

// ─── 1. Fields principali ─────────────────────────────────────────────────────

const mainFields: FieldDescriptor<TestModel>[] = [
  // ── Sezione "Informazioni personali" (group) ──────────────────────────────
  {
    key: "first_name",
    type: "text",
    label: "Nome",
    group: "Informazioni personali",
    cols: 6,
    required: true,
    validate: (v) => (!v ? "Campo obbligatorio" : null),
  },
  {
    key: "last_name",
    type: "text",
    label: "Cognome",
    group: "Informazioni personali",
    cols: 6,
    required: true,
  },
  {
    key: "email",
    type: "text",
    label: "Email",
    group: "Informazioni personali",
    validate: (v) => {
      if (!v) return null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
        ? null
        : "Email non valida";
    },
  },
  {
    key: "bio",
    type: "textarea",
    label: "Bio",
    expandable: true,
    group: "Informazioni personali",
    attrs: { placeholder: "Raccontaci qualcosa…", rows: 3 },
  },

  // ── Sezione "Progressive Disclosure" (group) ─────────────────────────────
  {
    key: "has_company",
    type: "switch",
    label: "Rappresento un'azienda",
    group: "Progressive Disclosure",
  },
  {
    key: "company_name",
    type: "text",
    label: "Ragione sociale",
    group: "Progressive Disclosure",
    cols: 8,
    visible: when(matchesField("has_company", true)),
    required: true,
  },
  {
    key: "company_vat",
    type: "text",
    label: "Partita IVA",
    group: "Progressive Disclosure",
    cols: 4,
    visible: when(matchesField("has_company", true)),
  },
  {
    key: "role",
    type: "select",
    label: "Ruolo nell'organizzazione",
    group: "Progressive Disclosure",
    // Visibile solo se ha un'azienda E il ruolo non è "viewer"
    visible: when(matchesField("has_company", true)),
    attrs: {
      items: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
        { label: "Viewer", value: "viewer" },
      ],
    },
  },

  // ── Sezione "Async Validation" (group) ──────────────────────────────────
  {
    key: "username",
    type: "text",
    label: "Username",
    group: "Async Validation",
    attrs: { placeholder: 'Prova: "admin" o "test" per vedere l\'errore' },
    validate: (v) => {
      if (!v) return "Username obbligatorio";
      if (String(v).length < 3) return "Minimo 3 caratteri";
      return null;
    },
    // Simula un check di unicità (500ms di delay)
    validateAsync: async (v) => {
      if (!v || String(v).length < 3) return null;
      await new Promise((r) => setTimeout(r, 500));
      const reserved = ["admin", "test", "root", "superuser"];
      return reserved.includes(String(v).toLowerCase())
        ? `"${v}" è già in uso — scegli un altro username`
        : null;
    },
    validateAsyncDebounce: 600,
  },
];

// ─── 2. Repeater con miniCard ─────────────────────────────────────────────────

const teamMemberDescriptor: RepeaterDescriptor<TestModel> = {
  key: "team_members",
  type: "repeater",
  label: "Team Members",
  fields: [
    { key: "name", type: "text", label: "Nome", cols: 6, required: true },
    {
      key: "role",
      type: "select",
      label: "Ruolo",
      cols: 6,
      attrs: {
        items: [
          { label: "Designer", value: "designer" },
          { label: "Developer", value: "developer" },
          { label: "Manager", value: "manager" },
          { label: "QA", value: "qa" },
        ],
      },
    },
    { key: "avatar_color", type: "color", label: "Colore avatar", cols: 4 },
    { key: "active", type: "switch", label: "Attivo", cols: 8 },
  ],
  attrs: {
    allowDuplicate: true,
    defaultExpanded: false,
    previewLabel: (item: unknown) => {
      const i = item as { name?: string; role?: string };
      return i.name
        ? `${i.name}${i.role ? ` — ${i.role}` : ""}`
        : "Nuovo membro";
    },
    // miniCard: attiva il contextual scaling dopo 3 item
    compressThreshold: 3,
    miniCard: (item: unknown, index: number) => {
      const i = item as {
        name?: string;
        role?: string;
        avatar_color?: string;
        active?: boolean;
      };
      return {
        title: i.name || `Membro ${index + 1}`,
        subtitle: i.role ?? undefined,
        statusColor: i.active ? "success" : "neutral",
      };
    },
  },
};

// ─── 3. Fields con tab annidati (C2) ──────────────────────────────────────────
// Dimostra tab: string[] — "Fatturazione" e "Spedizione" sono sub-tab di "Indirizzo".
// tab: 'Indirizzo/Fatturazione' è la forma equivalente con slash.

const addressFields: FieldDescriptor<TestModel>[] = [
  // Sub-tab: Indirizzo > Fatturazione
  {
    key: "address",
    type: "text",
    label: "Indirizzo di fatturazione",
    tab: ["Indirizzo", "Fatturazione"],
    cols: 12,
  },
  {
    key: "city",
    type: "text",
    label: "Città",
    tab: ["Indirizzo", "Fatturazione"],
    cols: 6,
  },
  {
    key: "country",
    type: "select",
    label: "Paese",
    tab: ["Indirizzo", "Fatturazione"],
    cols: 6,
    attrs: {
      items: [
        { label: "Italia", value: "IT" },
        { label: "Francia", value: "FR" },
        { label: "Germania", value: "DE" },
        { label: "Spagna", value: "ES" },
      ],
    },
  },
  // Sub-tab: Indirizzo > Spedizione (slash-separated form)
  {
    key: "shipping_address",
    type: "text",
    label: "Indirizzo di spedizione",
    tab: "Indirizzo/Spedizione",
    cols: 12,
  },
  {
    key: "shipping_city",
    type: "text",
    label: "Città",
    tab: "Indirizzo/Spedizione",
    cols: 6,
  },
  {
    key: "shipping_country",
    type: "select",
    label: "Paese",
    tab: "Indirizzo/Spedizione",
    cols: 6,
    attrs: {
      items: [
        { label: "Italia", value: "IT" },
        { label: "Francia", value: "FR" },
        { label: "Germania", value: "DE" },
        { label: "Spagna", value: "ES" },
      ],
    },
  },
];

// ─── 4. Fields con subtab dentro group (C2) ──────────────────────────────────
// Dimostra subtab: string — crea una tab bar DENTRO il group card "SEO".

const seoFields: FieldDescriptor<TestModel>[] = [
  // subtab: 'Base' dentro group: 'SEO'
  {
    key: "meta_title",
    type: "text",
    label: "Meta title",
    group: "SEO",
    subtab: "Base",
    cols: 12,
  },
  {
    key: "meta_description",
    type: "textarea",
    label: "Meta description",
    group: "SEO",
    subtab: "Base",
  },
  // subtab: 'Social' dentro group: 'SEO'
  {
    key: "og_title",
    type: "text",
    label: "OG title",
    group: "SEO",
    subtab: "Social",
    cols: 12,
  },
  {
    key: "og_image",
    type: "text",
    label: "OG image URL",
    group: "SEO",
    subtab: "Social",
  },
];

// ─── 5. flattenFieldGroups (C3) ───────────────────────────────────────────────
// Stessa struttura, scritta in forma gerarchica invece che flat.
// flattenFieldGroups propaga group/tab ai campi figli.

const flattenedFields = flattenFieldGroups<TestModel>([
  // Campo flat — passa invariato
  { key: "company_website", type: "text", label: "Sito web", cols: 12 },
  // Gruppo gerarchico — group + tab propagati a tutti i figli
  {
    group: "Contatti aziendali",
    fields: [
      {
        key: "company_email",
        type: "text",
        label: "Email aziendale",
        cols: 12,
      },
    ],
  },
  {
    group: "Indirizzo fatturazione",
    fields: [
      { key: "billing_address", type: "text", label: "Via", cols: 12 },
      { key: "billing_city", type: "text", label: "Città", cols: 6 },
    ],
  },
]);

// ─── useFormDraft ─────────────────────────────────────────────────────────────

const hasDraftBanner = ref(false);
const draftSavedAt = ref<Date | null>(null);

const form = useMapoForm({
  model,
  fields: mainFields,
  registry: $mapoFormRegistry,
});

const { clearDraft } = useFormDraft({
  model,
  isDirty: form.isDirty,
  key: "form-test:demo",
  onRestore(draft, savedAt) {
    draftSavedAt.value = savedAt;
    hasDraftBanner.value = true;
    // Non ripristina automaticamente — aspetta la scelta dell'utente
    Object.assign(model.value, draft);
  },
});

function discardDraft() {
  clearDraft();
  hasDraftBanner.value = false;
}

// ─── Stato salvataggio simulato ──────────────────────────────────────────────

const isSaving = ref(false);
const saveState = ref<"idle" | "saved" | "error">("idle");

async function save() {
  const { valid } = form.validateClient();
  if (!valid) return;

  isSaving.value = true;
  saveState.value = "idle";
  await new Promise((r) => setTimeout(r, 800));
  isSaving.value = false;
  saveState.value = "saved";
  clearDraft();
  setTimeout(() => (saveState.value = "idle"), 3000);
}
</script>

<template>
  <!-- Focus Portal — una sola istanza, si attiva via useFocusMode() -->
  <MapoFocusPortal />

  <div class="mx-auto max-w-5xl space-y-8 p-6">
    <!-- ── Intestazione ─────────────────────────────────────────────────────── -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">
          Form Engine — Test Page
        </h1>
        <p class="mt-1 text-sm text-gray-500">
          Ogni sezione testa una feature specifica. Nessun backend richiesto.
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          @click="
            model = {
              first_name: '',
              last_name: '',
              email: '',
              bio: '',
              has_company: false,
              company_name: '',
              company_vat: '',
              role: 'viewer',
              username: '',
              team_members: [],
              address: '',
              city: '',
              country: '',
              shipping_address: '',
              shipping_city: '',
              shipping_country: '',
              meta_title: '',
              meta_description: '',
              og_title: '',
              og_image: '',
              company_website: '',
              company_email: '',
              billing_address: '',
              billing_city: '',
            }
          "
        >
          Reset
        </UButton>
        <UButton
          :loading="isSaving"
          :icon="saveState === 'saved' ? 'i-lucide-check' : 'i-lucide-save'"
          :color="saveState === 'saved' ? 'success' : 'primary'"
          size="sm"
          @click="save"
        >
          {{ saveState === "saved" ? "Salvato!" : "Salva" }}
        </UButton>
      </div>
    </div>

    <!-- ── Draft Banner ──────────────────────────────────────────────────────── -->
    <Transition name="slide-fade">
      <UAlert
        v-if="hasDraftBanner"
        icon="i-lucide-clock"
        color="warning"
        variant="soft"
        title="Draft ripristinato"
        :description="`Modifiche salvate il ${draftSavedAt?.toLocaleString('it-IT')} — già ripristinate nel form.`"
      >
        <template #actions>
          <UButton
            size="xs"
            variant="ghost"
            color="warning"
            @click="discardDraft"
          >
            Cancella draft
          </UButton>
        </template>
      </UAlert>
    </Transition>

    <!-- ── Dirty indicator ──────────────────────────────────────────────────── -->
    <div
      v-if="form.isDirty.value"
      class="flex items-center gap-2 text-xs text-amber-600"
    >
      <span
        class="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"
      />
      Modifiche non salvate (draft autosalvato ogni 2s in localStorage)
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 1 — Layout base: group collassabili + griglia 12-col
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600"
          >1</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          Layout — Groups collassabili + griglia 12-col
        </h2>
      </div>
      <p class="text-sm text-gray-500">
        Group
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >Informazioni personali</code
        >: card con <code>rounded-xl shadow-sm</code>, heading collassabile,
        <code>gap-5</code> uniforme. Campi: <code>cols: 6</code> (metà),
        <code>cols: 12</code> (piena larghezza).
      </p>
      <MapoForm
        v-model="model"
        :fields="mainFields.filter((f) => f.group === 'Informazioni personali')"
        :errors="errors"
      />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 2 — Progressive Disclosure DSL
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600"
          >2</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          Progressive Disclosure —
          <code class="text-sm font-mono">when() / matchesField()</code>
        </h2>
      </div>
      <p class="text-sm text-gray-500">
        Attiva l'interruttore "Rappresento un'azienda" per vedere apparire i
        campi aziendali. I descriptor usano
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >visible: when(matchesField('has_company', true))</code
        >.
      </p>
      <MapoForm
        v-model="model"
        :fields="mainFields.filter((f) => f.group === 'Progressive Disclosure')"
        :errors="errors"
      />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 3 — Async Validation
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600"
          >3</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          Async Validation — indicatore visivo in label
        </h2>
      </div>
      <p class="text-sm text-gray-500">
        Scrivi nella casella username: <strong>admin</strong>,
        <strong>test</strong>, <strong>root</strong> generano errore dopo 500ms.
        Uno spinner appare nella label durante la verifica, poi check verde o x
        rossa.
      </p>
      <MapoForm
        v-model="model"
        :fields="mainFields.filter((f) => f.group === 'Async Validation')"
        :errors="errors"
      />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 4 — Repeater: miniCard, Focus Mode, Bulk Actions
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600"
          >4</span
        >
        <h2 class="text-base font-semibold text-gray-800">Repeater avanzato</h2>
      </div>

      <div class="grid grid-cols-1 gap-2 text-sm text-gray-500 sm:grid-cols-3">
        <div class="rounded-lg border border-gray-200 p-3">
          <p class="mb-1 font-medium text-gray-700">🗜 Contextual Scaling</p>
          <p>
            Aggiungi 4+ membri: quelli collassati diventano mini-card compatte
            con nome, ruolo e dot di stato.
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 p-3">
          <p class="mb-1 font-medium text-gray-700">⛶ Focus Mode</p>
          <p>
            Il pulsante
            <code class="rounded bg-gray-100 px-0.5 text-xs">↗</code> su ogni
            item apre il form a schermo intero con breadcrumb.
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 p-3">
          <p class="mb-1 font-medium text-gray-700">☑ Bulk Actions</p>
          <p>
            Clicca "Seleziona" nella toolbar per attivare la selezione multipla
            e le azioni bulk.
          </p>
        </div>
      </div>

      <!-- Il repeater usa un MapoForm wrapper per avere il context -->
      <MapoForm
        v-model="model"
        :fields="[teamMemberDescriptor]"
        :errors="errors"
      />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 5 — Tab con groups
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600"
          >5</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          Tab + Group — layout due livelli
        </h2>
      </div>
      <p class="text-sm text-gray-500">
        Nested tabs —
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >tab: ['Indirizzo', 'Fatturazione']</code
        >
        e
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >tab: 'Indirizzo/Spedizione'</code
        >
        producono un tab bar annidato dentro il tab "Indirizzo".
      </p>
      <MapoForm v-model="model" :fields="addressFields" :errors="errors" />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 6 — Subtab dentro group (C2)
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500"
          >6</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          Subtab dentro group card
        </h2>
      </div>
      <p class="text-sm text-gray-500">
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >subtab: 'Base'</code
        >
        e
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >subtab: 'Social'</code
        >
        creano una tab bar DENTRO il group card "SEO".
      </p>
      <MapoForm v-model="model" :fields="seoFields" :errors="errors" />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 7 — flattenFieldGroups (C3)
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600"
          >7</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          <code class="font-mono text-sm">flattenFieldGroups</code> — authoring
          gerarchico
        </h2>
      </div>
      <p class="text-sm text-gray-500">
        I campi sono definiti come albero
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >FieldGroupDescriptor</code
        >
        e appiattiti in
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >FieldDescriptor[]</code
        >
        da
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs"
          >flattenFieldGroups()</code
        >. Il risultato è identico a scrivere
        <code class="rounded bg-gray-100 px-1 py-0.5 text-xs">group: 'x'</code>
        su ogni campo manualmente.
      </p>
      <MapoForm v-model="model" :fields="flattenedFields" :errors="errors" />
    </section>

    <UDivider />

    <!-- ═══════════════════════════════════════════════════════════════════════
         SEZIONE 8 — Snapshot model (debug)
    ════════════════════════════════════════════════════════════════════════ -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500"
          >8</span
        >
        <h2 class="text-base font-semibold text-gray-800">
          Model snapshot (debug)
        </h2>
      </div>
      <pre
        class="max-h-64 overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-green-400"
        >{{ JSON.stringify(model, null, 2) }}</pre
      >
    </section>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 250ms ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

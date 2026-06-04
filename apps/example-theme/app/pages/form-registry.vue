<script setup lang="ts">
import { ref, defineComponent, h } from "vue";

definePageMeta({
  label: "Form — Customizzazione",
  icon: "i-lucide-settings-2",
});

// ─── 1. Field custom registrato inline (senza nuxt.config) ──────────────────
//
// In un progetto reale lo registreresti in nuxt.config:
//   mapoForm: { fields: { mapping: { 'star-rating': () => import('~/components/StarRatingField.vue') } } }
//
// Qui lo definiamo inline per tenere tutto in una pagina.

const StarRatingField = defineComponent({
  name: "StarRatingField",
  props: {
    modelValue: { type: Number, default: 0 },
    readonly: Boolean,
    disabled: Boolean,
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    function renderStar(i: number) {
      return h(
        "button",
        {
          type: "button",
          disabled: props.readonly || props.disabled,
          class: [
            "text-2xl transition-transform hover:scale-110",
            i < props.modelValue ? "text-yellow-400" : "text-gray-300",
          ],
          onClick: () => emit("update:modelValue", i + 1),
        },
        "★",
      );
    }
    return () =>
      h(
        "div",
        { class: "flex gap-1" },
        Array.from({ length: 5 }, (_, i) => renderStar(i)),
      );
  },
});

// ─── 2. Registry custom (merge con quello globale del plugin) ────────────────

const { $mapoFormRegistry } = useNuxtApp();

const customRegistry = {
  ...$mapoFormRegistry,
  mapping: {
    ...$mapoFormRegistry.mapping,
    "star-rating": StarRatingField, // 1. componente custom inline
  },
  attrs: {
    ...$mapoFormRegistry.attrs,
    All: {
      ...$mapoFormRegistry.attrs?.All,
      variant: "soft", // 2. tutti i field NUI in variant soft
    },
    text: {
      ...$mapoFormRegistry.attrs?.text,
      color: "primary", // 3. solo i text field con colore primary
    },
  },
};

// ─── 3. Form con registry custom ────────────────────────────────────────────

const model = ref({ title: "", priority: 3, category: "" });
const errors = ref({});

const fields = ref([
  { key: "title", type: "text" as const, label: "Titolo articolo" },
  {
    key: "priority",
    type: "star-rating" as any,
    label: "Priorità (custom field)",
  },
  {
    key: "category",
    type: "select" as const,
    label: "Categoria",
    attrs: {
      options: [
        { text: "Tech", value: "tech" },
        { text: "Design", value: "design" },
      ],
    },
  },
]);

const form = useMapoForm({
  model,
  fields,
  errors,
  registry: customRegistry,
  immediate: true,
});
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6">
    <h1 class="text-2xl font-bold">Customizzazione del Form</h1>
    <p class="text-sm text-gray-500">
      Questa pagina mostra tre pattern di customizzazione del form engine: field
      custom inline, override degli attrs globali, e override per singolo tipo.
    </p>

    <!-- ① Custom field via registry -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UBadge>1</UBadge>
          <span class="font-semibold"
            >Field custom registrato nel registry</span
          >
        </div>
      </template>
      <p class="mb-4 text-sm text-gray-500">
        <code>type: 'star-rating'</code> non esiste nei tipi built-in — il
        registry lo risolve con il componente Vue passato come
        <code>mapping['star-rating']</code>. Nessun
        <code>MapoUnknownField</code> giallo: il form non si rompe mai.
      </p>
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="customRegistry"
      />
    </UCard>

    <!-- ② Slot override -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UBadge>2</UBadge>
          <span class="font-semibold">Slot override per campo singolo</span>
        </div>
      </template>
      <p class="mb-4 text-sm text-gray-500">
        Lo slot <code>#field.title.append</code> inietta un bottone accanto al
        campo senza riscrivere il field o il registry.
      </p>
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="customRegistry"
      >
        <template #field.title.append>
          <UButton
            size="sm"
            variant="ghost"
            icon="i-lucide-wand"
            @click="model.title = 'Titolo generato automaticamente'"
          >
            Auto
          </UButton>
        </template>
        <template #field.title.hint>
          <p class="mt-1 text-xs text-gray-400">
            Massimo 255 caratteri. Usa parole chiave importanti.
          </p>
        </template>
        <template #field.priority.label="{ descriptor }">
          <label
            class="mb-1 flex items-center gap-1 text-sm font-medium text-amber-600"
          >
            <UIcon name="i-lucide-star" class="h-3.5 w-3.5" />
            {{ descriptor.label }} (label custom via slot)
          </label>
        </template>
      </MapoForm>
    </UCard>

    <!-- ③ descriptor.is — override diretto del componente per un singolo field -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UBadge>3</UBadge>
          <span class="font-semibold"
            >descriptor.is — override diretto per un campo</span
          >
        </div>
      </template>
      <p class="mb-4 text-sm text-gray-500">
        <code>descriptor.is</code> bypassa il registry completamente per quel
        singolo campo. Qui usiamo <code>StarRatingField</code> direttamente
        sull'istanza del descriptor.
      </p>
      <MapoForm
        v-model="model"
        :fields="[
          { key: 'title', type: 'text', label: 'Titolo' },
          {
            key: 'priority',
            type: 'number',
            label: 'Priorità (via descriptor.is)',
            is: StarRatingField,
          },
        ]"
        :errors="errors"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <UCard>
      <template #header>
        <span class="text-sm font-medium">Model corrente</span>
      </template>
      <pre class="text-xs">{{ JSON.stringify(model, null, 2) }}</pre>
    </UCard>
  </div>
</template>

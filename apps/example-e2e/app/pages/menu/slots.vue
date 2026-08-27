<script setup lang="ts">
/**
 * Menu Manager — customisation surfaces.
 *
 * Three levels of override, from lightest to heaviest:
 *   1. `core-fields`     — replace the built-in node fields entirely
 *   2. `editor-form-*`   — inject content above / below the form
 *   3. `editor-form`     — replace the form with your own component
 * Plus the `empty` slot for the right-pane placeholder.
 */
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import type { MenuTreeNode } from "@mapomodule/uikit/types";

definePageMeta({
  layout: "mapo-default",
  label: "Menu — Slots",
  icon: "i-lucide-square-dashed-mouse-pointer",
  parent: "menu",
  middleware: ["auth"],
});

type Mode = "core-fields" | "wrapped" | "full-override";
const mode = ref<Mode>("core-fields");

const modeItems = [
  { label: "core-fields", value: "core-fields" },
  { label: "form-top / form-bottom", value: "wrapped" },
  { label: "editor-form (full)", value: "full-override" },
];

/**
 * A minimal field set: title + a single URL. Passing `core-fields` drops the
 * built-in link-type / style / relational-picker fields altogether — the right
 * shape for a menu that only ever points at plain URLs.
 */
const coreFields: AnyFieldDescriptor[] = [
  { key: "title", label: "Label", type: "text", required: true },
  {
    key: "link.static",
    label: "URL",
    type: "url",
    attrs: { placeholder: "https://…" },
  },
];
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="space-y-2 border-b border-default bg-default px-6 py-3">
      <h1 class="text-lg font-semibold">Menu Manager — Slots & overrides</h1>
      <URadioGroup
        v-model="mode"
        :items="modeItems"
        orientation="horizontal"
        size="sm"
      />
    </div>

    <div class="min-h-0 flex-1">
      <!-- 1. Replace the built-in fields -->
      <MapoMenuManager
        v-if="mode === 'core-fields'"
        endpoint="/api/menus"
        identifier="2"
        :languages="['it', 'en']"
        :core-fields="coreFields"
      >
        <template #empty>
          <UIcon
            name="i-lucide-mouse-pointer-click"
            class="size-10 text-dimmed"
          />
          <p class="text-sm text-muted">
            Placeholder personalizzato via slot <code>#empty</code>
          </p>
        </template>
      </MapoMenuManager>

      <!-- 2. Wrap the default form -->
      <MapoMenuManager
        v-else-if="mode === 'wrapped'"
        endpoint="/api/menus"
        identifier="2"
        :languages="['it', 'en']"
      >
        <template #editor-form-top="{ model }">
          <UAlert
            icon="i-lucide-info"
            color="info"
            variant="subtle"
            class="mb-4"
            :title="`Nodo: ${(model as MenuTreeNode).title || 'senza titolo'}`"
            description="Contenuto iniettato con lo slot #editor-form-top."
          />
        </template>

        <template #editor-form-bottom="{ model }">
          <div class="mt-4 rounded border border-default bg-elevated p-3">
            <p class="mb-1 text-xs font-semibold uppercase text-dimmed">
              #editor-form-bottom — nodo corrente
            </p>
            <pre class="overflow-x-auto text-[10px]">{{
              JSON.stringify(model, null, 2)
            }}</pre>
          </div>
        </template>
      </MapoMenuManager>

      <!-- 3. Replace the form entirely -->
      <MapoMenuManager
        v-else
        endpoint="/api/menus"
        identifier="2"
        :languages="['it', 'en']"
      >
        <template #editor-form="{ model, readonly }">
          <div class="space-y-3">
            <UAlert
              icon="i-lucide-wrench"
              color="warning"
              variant="subtle"
              title="Form completamente sostituito"
              description="Lo slot #editor-form rimpiazza MapoForm: qui sotto ci sono input scritti a mano che scrivono direttamente sul nodo."
            />
            <UFormField label="Titolo" size="sm">
              <UInput
                v-model="(model as MenuTreeNode).title"
                :disabled="readonly"
                class="w-full"
              />
            </UFormField>
            <UFormField label="URL statico" size="sm">
              <UInput
                v-model="(model as MenuTreeNode).link.static as string"
                :disabled="readonly"
                placeholder="/chi-siamo"
                class="w-full"
              />
            </UFormField>
          </div>
        </template>
      </MapoMenuManager>
    </div>
  </div>
</template>

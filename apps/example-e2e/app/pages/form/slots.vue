<script setup lang="ts">
// Tests: MapoForm slot system — full field override (#field.{key}), granular sub-slots
// (label, before, prepend, append, hint, after), slot for non-existent field (silently ignored),
// dynamic slot names, v-model still works from within a custom slot.
// E2E plan: e2e/form/slots.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Form Slots",
  icon: "i-lucide-puzzle",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

// Slot name constants (bracket syntax #['x.y'] is not supported by Prettier's Vue parser)
const slotEmail = "field.email";
const slotNonexistent = "field.nonexistent";
const slotWebsiteLabel = "field.website.label";
const slotWebsiteBefore = "field.website.before";
const slotWebsitePrepend = "field.website.prepend";
const slotWebsiteAppend = "field.website.append";
const slotWebsiteHint = "field.website.hint";
const slotWebsiteAfter = "field.website.after";

interface Model {
  name: string;
  email: string;
  website: string;
}

const model = ref<Model>({ name: "", email: "", website: "" });

function copyWebsite() {
  navigator.clipboard?.writeText(model.value.website);
}
const errors = ref<Record<string, string[]>>({});

const fields: FieldDescriptor<Model>[] = [
  { key: "name", type: "text", label: "Name", cols: 6, required: true },
  { key: "email", type: "email", label: "Email", cols: 6 },
  { key: "website", type: "url", label: "Website", cols: 12 },
];
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">
        Form Slots
      </h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/slots.md</code>
      </p>
    </div>

    <!-- Tests 1.1–1.3: full field override via #field.email -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">Full field override (#field.email) — tests 1.1–1.3</span>
      </template>
      <p class="text-xs text-muted mb-3">
        The "email" field is replaced by a custom slot. It still writes to
        <code>model.email</code>. The "name" field uses the default renderer.
      </p>

      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="$mapoFormRegistry"
      >
        <!-- Tests 1.1: custom slot replaces entire field rendering -->
        <template #[slotEmail]="{ field }">
          <div
            class="border border-dashed border-primary/50 rounded-lg p-3 space-y-1"
          >
            <p class="text-xs text-primary font-medium">
              Custom email slot (replaces field renderer)
            </p>
            <UInput
              v-model="model.email"
              placeholder="custom email input"
              leading-icon="i-lucide-mail"
              class="w-full"
            />
            <p class="text-xs text-muted">
              Slot received field key: <code>{{ field.key }}</code>
            </p>
          </div>
        </template>

        <!-- Tests 5.1: slot for non-existent field — should be silently ignored -->
        <template #[slotNonexistent]>
          <div>THIS SHOULD NOT BE VISIBLE</div>
        </template>
      </MapoForm>
    </UCard>

    <!-- Tests 2.1–2.6: granular sub-slots -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">Granular sub-slots — tests 2.1–2.6</span>
      </template>
      <p class="text-xs text-muted mb-3">
        The "website" field uses sub-slots: custom label, before (alert above),
        prepend (icon inside), append (copy button), hint (custom hint), after
        (helper below errors).
      </p>

      <MapoForm
        v-model="model"
        :fields="fields.slice(2, 3)"
        :errors="errors"
        :registry="$mapoFormRegistry"
      >
        <!-- Tests 2.1: custom label -->
        <template #[slotWebsiteLabel]="{ label }">
          <span class="font-bold text-primary">{{ label }}
            <span class="text-xs font-normal text-muted">(custom label slot)</span></span>
        </template>

        <!-- Tests 2.2: content before the field wrapper -->
        <template #[slotWebsiteBefore]>
          <UAlert
            icon="i-lucide-info"
            color="info"
            title="Tip"
            description="Include https://"
            class="mb-2"
          />
        </template>

        <!-- Tests 2.3: prepend inside control -->
        <template #[slotWebsitePrepend]>
          <UIcon
            name="i-lucide-globe"
            class="size-4 text-muted"
          />
        </template>

        <!-- Tests 2.4: append inside control -->
        <template #[slotWebsiteAppend]>
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyWebsite"
          />
        </template>

        <!-- Tests 2.5: custom hint replaces default -->
        <template #[slotWebsiteHint]>
          <a
            href="#"
            class="text-xs text-primary hover:underline"
          >Need help with URLs?</a>
        </template>

        <!-- Tests 2.6: content after errors -->
        <template #[slotWebsiteAfter]>
          <p class="text-xs text-muted mt-1">
            Current value: <code>{{ model.website || "(empty)" }}</code>
          </p>
        </template>
      </MapoForm>
    </UCard>

    <!-- Live model -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">Live model</span>
      </template>
      <pre class="text-xs overflow-auto">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>
  </div>
</template>

<script setup lang="ts">
// Tests: component override INSIDE a repeater item.
// Since MapoRepeaterItem reuses useMapoForm (P5), each item's fields go through
// MapoFormField, which honors `descriptor.is` (direct component) and the registry
// `type` exactly like a top-level field. This page proves both paths work nested.
import { defineComponent, h } from "vue";
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Repeater Override",
  icon: "i-lucide-replace",
  middleware: ["auth"],
});

// A minimal custom field component used as a direct override via `descriptor.is`.
// Contract: `modelValue` in, `update:modelValue` + `blur` out — same as any Mapo field.
const UppercaseField = defineComponent({
  name: "UppercaseField",
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue", "blur"],
  setup(props, { emit }) {
    return () =>
      h("input", {
        class:
          "w-full rounded border border-gray-300 px-2 py-1 font-mono uppercase",
        value: props.modelValue,
        onInput: (e: Event) =>
          emit("update:modelValue", (e.target as HTMLInputElement).value),
        onBlur: () => emit("blur"),
      });
  },
});

interface Block {
  title: string;
  code: string;
}
interface Model {
  blocks: Block[];
}

const model = ref<Model>({
  blocks: [{ title: "First", code: "abc" }],
});
const errors = ref<Record<string, string[]>>({});

const fields: FieldDescriptor<Model>[] = [
  {
    key: "blocks",
    type: "repeater",
    label: "Blocks",
    attrs: {
      previewLabel: (item: unknown) => (item as Block).title || "Block",
      allowDuplicate: true,
    },
    fields: [
      { key: "title", type: "text", label: "Title", required: true },
      {
        key: "code",
        type: "text",
        // Overridden via `descriptor.is`: renders UppercaseField instead of the
        // registry's default text input — and it works because the repeater item
        // resolves fields through MapoFormField just like the root form.
        is: UppercaseField,
        label: "Code (overridden via descriptor.is)",
      },
    ],
  } as FieldDescriptor<Model>,
];
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">
        Component override inside a repeater
      </h1>
      <p class="mt-1 text-sm text-muted">
        The <code>code</code> field inside each repeater item is overridden with
        a custom component via <code>descriptor.is</code>. Required validation
        on <code>title</code> also runs per item (repeater reuses
        <code>useMapoForm</code>).
      </p>
    </div>

    <UCard>
      <MapoForm v-model="model" :fields="fields" :errors="errors" />
    </UCard>

    <UCard>
      <template #header>
        <span class="text-sm font-semibold text-highlighted">Live model</span>
      </template>
      <pre class="overflow-auto text-xs">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>
  </div>
</template>

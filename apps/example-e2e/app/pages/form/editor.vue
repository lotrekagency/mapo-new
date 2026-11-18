<script setup lang="ts">
// Scenario: the editor field's opt-in attrs. `attrs.source` adds an HTML source
// view; `attrs.toolbar` adds buttons for the commands of the extensions the
// field loads (here StarterKit's, which every editor field has). The last
// field has neither: its toolbar is the built-in one.
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Editor",
  icon: "i-lucide-pilcrow",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  body: string;
  locked: string;
  plain: string;
}

const savedBody =
  '<h2>Source view</h2><p>Some <strong>bold</strong> text and a <a href="https://example.com">link</a>.</p><ul><li><p>One</p></li><li><p>Two</p></li></ul>';
const draftBody =
  "<p>A draft restored from outside: the source view shows it at once.</p>";

const model = ref<Model>({
  body: savedBody,
  locked: "<p>A read-only field shows its source but does not change it.</p>",
  plain: "<p>No new attrs: the toolbar is the built-in one.</p>",
});

const fields: FieldDescriptor<Model>[] = [
  {
    key: "body",
    type: "editor",
    label: "Source view and custom buttons",
    attrs: {
      source: true,
      toolbar: [
        {
          key: "quote",
          icon: "i-lucide-text-quote",
          label: "Quote",
          action: (editor) => editor.chain().focus().toggleBlockquote().run(),
          isActive: (editor) => editor.isActive("blockquote"),
        },
        {
          key: "code",
          icon: "i-lucide-square-code",
          label: "Code block",
          action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
          isActive: (editor) => editor.isActive("codeBlock"),
        },
        {
          key: "rule",
          icon: "i-lucide-minus",
          label: "Horizontal rule",
          action: (editor) => editor.chain().focus().setHorizontalRule().run(),
        },
        {
          key: "lift",
          label: "Outdent",
          action: (editor) =>
            editor.chain().focus().liftListItem("listItem").run(),
          isDisabled: (editor) => !editor.can().liftListItem("listItem"),
        },
      ],
    },
  },
  {
    key: "locked",
    type: "editor",
    label: "Read-only, with source view",
    readonly: true,
    attrs: { source: true },
  },
  { key: "plain", type: "editor", label: "No new attrs" },
];
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Editor</h1>
      <p class="text-muted text-sm mt-1">
        <code>attrs.source</code> and <code>attrs.toolbar</code> on
        <code>type: 'editor'</code>
      </p>
    </div>

    <UCard>
      <MapoForm
        v-model="model"
        :fields="fields"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- A value set from outside while the source view is open -->
    <div class="flex gap-2">
      <UButton
        variant="outline"
        color="neutral"
        size="sm"
        @click="model.body = draftBody"
      >
        Load a draft into the first field
      </UButton>
      <UButton
        variant="outline"
        color="neutral"
        size="sm"
        @click="model.body = savedBody"
      >
        Reset the first field
      </UButton>
    </div>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">Live model</span>
      </template>
      <pre class="text-xs overflow-auto whitespace-pre-wrap">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Manual checklist</span
        >
      </template>
      <ul class="space-y-1.5 text-sm text-muted list-disc list-inside">
        <li>
          The source toggle is the last toolbar button; it shows the HTML one
          block per line, and disables every other button
        </li>
        <li>
          Type <code>&lt;p onclick="x()"&gt;a&lt;/p&gt;&lt;script&gt;…</code>:
          the live model never gets the script or the handler
        </li>
        <li>
          A <code>&lt;div&gt;</code> typed in the source reaches the live model
          as a paragraph, and a <code>style</code> attribute not at all
        </li>
        <li>
          Back to the visual view: the editor shows what was typed, and undo
          steps back through it
        </li>
        <li>
          With the source open, "Load a draft" and "Reset" replace the textarea
        </li>
        <li>
          The read-only field shows its source, and the textarea is locked
        </li>
        <li>
          Quote, Code block and Horizontal rule act on the selection; Quote and
          Code block light up inside their node; Outdent is enabled only in a
          nested list item
        </li>
        <li>The last field has the built-in toolbar only</li>
      </ul>
    </UCard>
  </div>
</template>

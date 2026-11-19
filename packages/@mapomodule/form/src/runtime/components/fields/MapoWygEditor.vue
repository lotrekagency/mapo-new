<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onBeforeUnmount,
  resolveComponent,
  useId,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRuntimeConfig } from "#app";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import type { AnyExtension } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { debounce } from "@mapomodule/utils";
import type {
  EditorDescriptor,
  EditorToolbarEditor,
  EditorToolbarItem,
  MapoFormRuntimeConfig,
} from "../../types/index.js";
import { formatHtml } from "../../utils/formatHtml.js";
import {
  ALLOWED_LINK_PROTOCOLS,
  isSafeUrl,
  sanitizeHtml,
} from "../../utils/sanitizeHtml.js";

const props = defineProps<{
  modelValue: unknown;
  descriptor: EditorDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();

const extraExtensions =
  (props.descriptor.attrs?.extensions as AnyExtension[] | undefined) ?? [];

const editor = useEditor({
  content: sanitizeHtml((props.modelValue as string) ?? ""),
  editable: !props.readonly && !props.disabled,
  extensions: [
    StarterKit,
    Link.configure({
      openOnClick: false,
      protocols: ALLOWED_LINK_PROTOCOLS,
      validate: (href: string) => isSafeUrl(href),
    }),
    Underline,
    Image.configure({ inline: false, allowBase64: false }),
    ...extraExtensions,
  ] as AnyExtension[],
  onUpdate: ({ editor: e }) => {
    emit("update:modelValue", e.getHTML());
  },
});

// Sync readonly prop → editor editable
watch(
  () => [props.readonly, props.disabled],
  ([ro, dis]) => editor.value?.setEditable(!ro && !dis),
);

// ─── HTML source view (`attrs.source`) ────────────────────────────────────
// The textarea edits a copy of the HTML. After each pause in the typing the
// copy goes through the editor (sanitizer, then schema), and the editor's HTML
// is what the field emits: the saved value is sanitized and normalized even
// when the form is saved from the source view. The editor stays mounted behind
// the textarea (`v-show`), so its history survives the switch.
const SOURCE_SYNC_DELAY_MS = 250;

// The field's own `attrs.source` wins; otherwise the module option
// `editor.source`, which the module defaults to `true`.
const appEditorDefaults = (
  useRuntimeConfig().public.mapoForm as MapoFormRuntimeConfig | undefined
)?.editor;
const hasSourceView =
  props.descriptor.attrs?.source ?? appEditorDefaults?.source ?? true;
const sourceMode = ref(false);
const sourceHtml = ref("");
const sourceHintId = useId();
// Whether the textarea holds typing the editor has not received yet.
let sourcePending = false;

const isLocked = computed(() => props.readonly || props.disabled);
const isToolbarDisabled = computed(() => isLocked.value || sourceMode.value);

/** Writes the textarea's typing into the editor and emits the result. */
function flushSource() {
  syncSource.cancel();
  const current = editor.value;
  if (!current) return;
  if (!sourcePending) return;
  sourcePending = false;
  const before = current.getHTML();
  current.commands.setContent(sanitizeHtml(sourceHtml.value), false);
  const after = current.getHTML();
  // Like the visual editor, emit only when the document changed: typing that
  // the schema drops, or whitespace, leaves the value as it is.
  const documentChanged = after !== before;
  if (documentChanged) emit("update:modelValue", after);
}

const syncSource = debounce(flushSource, SOURCE_SYNC_DELAY_MS);

function onSourceInput(value: unknown) {
  if (isLocked.value) return;
  sourceHtml.value = String(value ?? "");
  sourcePending = true;
  syncSource();
}

function toggleSource() {
  const current = editor.value;
  if (!current) return;
  if (sourceMode.value) {
    // The editor is up to date once the last typing is in.
    flushSource();
    sourceMode.value = false;
    return;
  }
  sourceHtml.value = formatHtml(current.getHTML());
  sourceMode.value = true;
}

// Sync modelValue esterno → editor (es. reset dopo save). The field's own
// emits come back here as the editor's HTML and are skipped, so the textarea
// is never rewritten under the cursor.
watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && val !== editor.value.getHTML()) {
      editor.value.commands.setContent(
        sanitizeHtml((val as string) ?? ""),
        false,
      );
      if (!sourceMode.value) return;
      // A value from outside (a reset, a draft) replaces the typing.
      syncSource.cancel();
      sourcePending = false;
      sourceHtml.value = formatHtml(editor.value.getHTML());
    }
  },
);

onBeforeUnmount(() => {
  // Typing still waiting for the pause is not lost when the field goes away.
  flushSource();
  editor.value?.destroy();
});

// ─── Custom toolbar buttons (`attrs.toolbar`) ─────────────────────────────
const toolbarItems: EditorToolbarItem[] = props.descriptor.attrs?.toolbar ?? [];

/**
 * Asks an item's predicate about the editor; no predicate means `false`. One
 * that throws (a command whose extension the field does not load) gives
 * `fallback` instead of breaking the toolbar.
 */
function askItem(
  question: (editor: EditorToolbarEditor) => boolean | undefined,
  fallback: boolean,
): boolean {
  const current = editor.value;
  if (!current) return fallback;
  try {
    return question(current) ?? false;
  } catch {
    return fallback;
  }
}

function isItemDisabled(item: EditorToolbarItem): boolean {
  if (isToolbarDisabled.value) return true;
  return askItem((current) => item.isDisabled?.(current), true);
}

function isItemActive(item: EditorToolbarItem): boolean {
  return askItem((current) => item.isActive?.(current), false);
}

function runItem(item: EditorToolbarItem) {
  const current = editor.value;
  if (!current) return;
  item.action(current);
}

// ─── Image insertion ──────────────────────────────────────────────────────
// MapoMediaManagerDialog is globally registered by @mapomodule/uikit.
// resolveComponent() works at runtime because it is registered before this
// component renders. We avoid a direct import to break the form → uikit cycle.
const imagePickerOpen = ref(false);
const MediaManagerDialog = resolveComponent("MapoMediaManagerDialog");
const hasMediaManager = typeof MediaManagerDialog !== "string";

function onImageConfirm(
  selection:
    | { file: string; alt_text?: string }
    | Array<{ file: string; alt_text?: string }>,
) {
  const media = Array.isArray(selection) ? selection[0] : selection;
  if (!media || !editor.value) return;
  editor.value
    .chain()
    .focus()
    .setImage({ src: media.file, alt: media.alt_text ?? "" })
    .run();
}
</script>

<template>
  <!-- An input surface of its own, like the Nuxt UI inputs next to it
       (`bg-default`, `accented` border): without it the text area takes the
       page background and disappears on a tinted page. -->
  <div
    class="mapo-wyg-editor rounded-md border bg-default"
    :class="[
      errors?.length ? 'border-red-300' : 'border-accented',
      readonly || disabled ? 'opacity-60' : '',
    ]"
  >
    <!-- Toolbar -->
    <div
      v-if="editor"
      class="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5"
    >
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong>B</strong>
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em>I</em>
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('underline') }"
        @click="editor.chain().focus().toggleUnderline().run()"
      >
        <span class="underline">U</span>
      </UButton>

      <USeparator orientation="vertical" class="mx-1 h-5" />

      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('heading', { level: 3 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </UButton>

      <USeparator orientation="vertical" class="mx-1 h-5" />

      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('bulletList') }"
        icon="i-lucide-list"
        @click="editor.chain().focus().toggleBulletList().run()"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        :class="{ 'bg-gray-200': editor.isActive('orderedList') }"
        icon="i-lucide-list-ordered"
        @click="editor.chain().focus().toggleOrderedList().run()"
      />

      <USeparator orientation="vertical" class="mx-1 h-5" />

      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        icon="i-lucide-undo"
        @click="editor.chain().focus().undo().run()"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="isToolbarDisabled"
        icon="i-lucide-redo"
        @click="editor.chain().focus().redo().run()"
      />

      <USeparator orientation="vertical" class="mx-1 h-5" />

      <!-- Insert Image via Media Manager (available when @mapomodule/uikit is installed) -->
      <UTooltip
        :text="
          hasMediaManager
            ? t('mapo.wygEditor.insertImage')
            : t('mapo.wygEditor.requiresUikit')
        "
        :delay-open="300"
      >
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-image"
          :disabled="isToolbarDisabled || !hasMediaManager"
          @click="imagePickerOpen = true"
        />
      </UTooltip>

      <!-- Custom buttons (`attrs.toolbar`), after the built-in ones -->
      <template v-if="toolbarItems.length">
        <USeparator orientation="vertical" class="mx-1 h-5" />
        <UTooltip
          v-for="item in toolbarItems"
          :key="item.key"
          :text="item.label"
          :delay-duration="300"
        >
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :icon="item.icon"
            :label="item.icon ? undefined : item.label"
            :aria-label="item.label"
            :disabled="isItemDisabled(item)"
            :class="{ 'bg-gray-200': isItemActive(item) }"
            @click="runItem(item)"
          />
        </UTooltip>
      </template>

      <!-- HTML source toggle (`attrs.source`): stays active in the source
           view, and on a read-only field, which can show its source. -->
      <template v-if="hasSourceView">
        <USeparator orientation="vertical" class="mx-1 h-5" />
        <UTooltip :text="t('mapo.wygEditor.source')" :delay-duration="300">
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-code-xml"
            :aria-label="t('mapo.wygEditor.source')"
            :aria-pressed="sourceMode"
            :class="{ 'bg-gray-200': sourceMode }"
            @click="toggleSource"
          />
        </UTooltip>
      </template>
    </div>

    <!-- Editor content: hidden, not unmounted, in the source view -->
    <EditorContent
      v-show="!sourceMode"
      :editor="editor"
      class="prose prose-sm max-w-none px-3 py-2 focus-within:outline-none"
    />

    <div v-if="sourceMode" class="px-3 py-2">
      <UTextarea
        :model-value="sourceHtml"
        autoresize
        :rows="6"
        :readonly="isLocked"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        :aria-label="t('mapo.wygEditor.source')"
        :aria-describedby="sourceHintId"
        :ui="{ base: 'font-mono text-xs' }"
        class="w-full"
        @update:model-value="onSourceInput"
        @blur="flushSource"
      />
      <p :id="sourceHintId" class="mt-1 text-xs text-muted">
        {{ t("mapo.wygEditor.sourceHint") }}
      </p>
    </div>

    <p
      v-for="err in errors"
      :key="err"
      class="px-3 pb-2 text-sm text-red-500"
      role="alert"
    >
      {{ err }}
    </p>

    <!-- Image picker dialog — only rendered when MapoMediaManagerDialog is
         globally available. Inside the root on purpose: a second root would
         drop what MapoFormField passes down (`flex-1`, `id`, `style`), and the
         editor would shrink to its toolbar. As a modal it renders in <body>. -->
    <component
      :is="MediaManagerDialog"
      v-if="hasMediaManager"
      v-model="imagePickerOpen"
      selection-mode="single"
      mime="image/*"
      @confirm="onImageConfirm"
    />
  </div>
</template>

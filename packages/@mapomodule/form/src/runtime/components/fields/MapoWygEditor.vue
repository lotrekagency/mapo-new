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
import TextAlign from "@tiptap/extension-text-align";
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

// The module options under `editor`: a field's own `attrs` win over them.
const appEditorDefaults = (
  useRuntimeConfig().public.mapoForm as MapoFormRuntimeConfig | undefined
)?.editor;

const extraExtensions =
  (props.descriptor.attrs?.extensions as AnyExtension[] | undefined) ?? [];

// ─── Text alignment (`attrs.textAlign`) ───────────────────────────────────
// Loaded only where the field offers it: elsewhere the schema drops the
// alignment of pasted text, as it drops any markup no extension supports.
// Left is the default and writes no style; a field that loads its own
// TextAlign through `attrs.extensions` keeps it.
const hasTextAlign =
  props.descriptor.attrs?.textAlign ?? appEditorDefaults?.textAlign ?? false;
const loadsOwnTextAlign = extraExtensions.some(
  (extension) => extension.name === "textAlign",
);
const alignmentExtensions: AnyExtension[] =
  hasTextAlign && !loadsOwnTextAlign
    ? [
        TextAlign.configure({
          types: ["heading", "paragraph"],
          alignments: ["left", "center", "right"],
        }),
      ]
    : [];

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
    ...alignmentExtensions,
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

// ─── Links ────────────────────────────────────────────────────────────────
// A bar under the toolbar edits the link at the selection. Not a <form>: the
// field sits inside the page's form, which Enter would submit. The address is
// checked against the same allowlist as the Link extension (relative paths,
// http, https, mailto, tel); one starting with `www.` gets `https://`.
const linkOpen = ref(false);
const linkUrl = ref("");
const linkInvalid = ref(false);
const linkErrorId = useId();

function closeLink() {
  linkOpen.value = false;
  linkInvalid.value = false;
}

function toggleLink() {
  const current = editor.value;
  if (!current) return;
  if (linkOpen.value) {
    closeLink();
    return;
  }
  linkUrl.value = (current.getAttributes("link").href as string) ?? "";
  linkInvalid.value = false;
  linkOpen.value = true;
}

function removeLink() {
  editor.value?.chain().focus().extendMarkRange("link").unsetLink().run();
  closeLink();
}

function applyLink() {
  const current = editor.value;
  if (!current) return;
  const typed = linkUrl.value.trim();
  if (!typed) {
    removeLink();
    return;
  }
  const href = /^www\./i.test(typed) ? `https://${typed}` : typed;
  if (!isSafeUrl(href)) {
    linkInvalid.value = true;
    return;
  }
  const chain = current.chain().focus();
  if (current.state.selection.empty && !current.isActive("link")) {
    // Nothing selected: the address becomes the link's text.
    chain
      .insertContent({
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run();
  } else {
    chain.extendMarkRange("link").setLink({ href }).run();
  }
  closeLink();
}

/** Enter applies, Escape closes; neither reaches the page's form. */
function onLinkKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    applyLink();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeLink();
  }
}

// The bar goes with the toolbar: in the source view and on a locked field.
watch(isToolbarDisabled, (disabled) => {
  if (disabled) closeLink();
});

// ─── Alignment buttons ────────────────────────────────────────────────────
type Alignment = "left" | "center" | "right";
const alignments: { value: Alignment; icon: string; label: string }[] = [
  {
    value: "left",
    icon: "i-lucide-align-left",
    label: "mapo.wygEditor.alignLeft",
  },
  {
    value: "center",
    icon: "i-lucide-align-center",
    label: "mapo.wygEditor.alignCenter",
  },
  {
    value: "right",
    icon: "i-lucide-align-right",
    label: "mapo.wygEditor.alignRight",
  },
];

function isAligned(value: Alignment): boolean {
  const current = editor.value;
  if (!current) return false;
  if (value !== "left") return current.isActive({ textAlign: value });
  return (
    !current.isActive({ textAlign: "center" }) &&
    !current.isActive({ textAlign: "right" })
  );
}

function align(value: Alignment) {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  // Left is the default: removing the alignment writes no style.
  (value === "left" ? chain.unsetTextAlign() : chain.setTextAlign(value)).run();
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

      <!-- Alignment (`attrs.textAlign`) -->
      <template v-if="hasTextAlign">
        <USeparator orientation="vertical" class="mx-1 h-5" />
        <UTooltip
          v-for="alignment in alignments"
          :key="alignment.value"
          :text="t(alignment.label)"
          :delay-duration="300"
        >
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :icon="alignment.icon"
            :aria-label="t(alignment.label)"
            :aria-pressed="isAligned(alignment.value)"
            :disabled="isToolbarDisabled"
            :class="{ 'bg-gray-200': isAligned(alignment.value) }"
            @click="align(alignment.value)"
          />
        </UTooltip>
      </template>

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

      <!-- Link: opens the link bar under the toolbar -->
      <UTooltip :text="t('mapo.wygEditor.link')" :delay-duration="300">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-link"
          :aria-label="t('mapo.wygEditor.link')"
          :aria-expanded="linkOpen"
          :disabled="isToolbarDisabled"
          :class="{ 'bg-gray-200': linkOpen || editor.isActive('link') }"
          @click="toggleLink"
        />
      </UTooltip>

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

    <!-- Link bar: the address of the link at the selection -->
    <div
      v-if="linkOpen && editor"
      class="flex flex-wrap items-center gap-2 border-b border-gray-200 px-2 py-1.5"
    >
      <UInput
        v-model="linkUrl"
        size="xs"
        autofocus
        class="min-w-56 flex-1"
        :placeholder="t('mapo.wygEditor.linkPlaceholder')"
        :aria-label="t('mapo.wygEditor.linkUrl')"
        :aria-invalid="linkInvalid"
        :aria-describedby="linkInvalid ? linkErrorId : undefined"
        @keydown="onLinkKeydown"
      />
      <UButton
        size="xs"
        :label="t('mapo.wygEditor.linkApply')"
        @click="applyLink"
      />
      <UButton
        v-if="editor.isActive('link')"
        size="xs"
        variant="ghost"
        color="neutral"
        :label="t('mapo.wygEditor.linkRemove')"
        @click="removeLink"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        :aria-label="t('mapo.wygEditor.linkCancel')"
        @click="closeLink"
      />
      <p
        v-if="linkInvalid"
        :id="linkErrorId"
        class="w-full text-xs text-red-500"
        role="alert"
      >
        {{ t("mapo.wygEditor.linkInvalid") }}
      </p>
    </div>

    <!-- Editor content: hidden, not unmounted, in the source view. Its
         elements are styled below: Tailwind's preflight leaves headings,
         lists and links looking like plain text. -->
    <EditorContent
      v-show="!sourceMode"
      :editor="editor"
      class="mapo-wyg-content px-3 py-2 focus-within:outline-none"
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

<style scoped>
/* The editor's content. Tailwind's preflight resets headings, lists and links
   to plain text, and the app may not load a typography plugin: these rules
   give each element its look, with Nuxt UI's tokens, so they follow the theme
   and the colour mode. */
.mapo-wyg-content {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text);
}
.mapo-wyg-content :deep(.ProseMirror > * + *) {
  margin-top: 0.75em;
}
.mapo-wyg-content :deep(h2),
.mapo-wyg-content :deep(h3) {
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
.mapo-wyg-content :deep(h2) {
  font-size: 1.375em;
  line-height: 1.3;
}
.mapo-wyg-content :deep(h3) {
  font-size: 1.125em;
  line-height: 1.4;
}
.mapo-wyg-content :deep(.ProseMirror > :is(h2, h3):not(:first-child)) {
  margin-top: 1.25em;
}
.mapo-wyg-content :deep(ul) {
  list-style: disc;
  padding-left: 1.5em;
}
.mapo-wyg-content :deep(ol) {
  list-style: decimal;
  padding-left: 1.5em;
}
.mapo-wyg-content :deep(li + li),
.mapo-wyg-content :deep(li > :is(ul, ol)) {
  margin-top: 0.25em;
}
.mapo-wyg-content :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.mapo-wyg-content :deep(blockquote) {
  border-left: 3px solid var(--ui-border-accented);
  padding-left: 1em;
  color: var(--ui-text-muted);
}
.mapo-wyg-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875em;
  padding: 0.1em 0.3em;
  border-radius: 0.25rem;
  background: var(--ui-bg-elevated);
}
.mapo-wyg-content :deep(pre) {
  padding: 0.75em 1em;
  border-radius: 0.375rem;
  background: var(--ui-bg-elevated);
  overflow-x: auto;
}
.mapo-wyg-content :deep(pre code) {
  padding: 0;
  background: none;
}
.mapo-wyg-content :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
}
.mapo-wyg-content :deep(img) {
  max-width: 100%;
  height: auto;
}
/* Tables, for the fields that load the table extensions. */
.mapo-wyg-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.mapo-wyg-content :deep(:is(th, td)) {
  border: 1px solid var(--ui-border-accented);
  padding: 0.375em 0.5em;
  vertical-align: top;
  text-align: left;
}
.mapo-wyg-content :deep(th) {
  font-weight: 600;
  background: var(--ui-bg-elevated);
}
.mapo-wyg-content :deep(:is(th, td) > p) {
  margin: 0;
}
.mapo-wyg-content :deep(.selectedCell) {
  background: color-mix(in oklab, var(--ui-primary) 12%, transparent);
}
</style>

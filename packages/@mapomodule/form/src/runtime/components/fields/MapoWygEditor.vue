<script setup lang="ts">
import { ref, watch, onBeforeUnmount, resolveComponent } from "vue";
import { useI18n } from "vue-i18n";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import type { AnyExtension } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import type { EditorDescriptor } from "../../types/index.js";

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

// Protocol allowlist for user-entered links. Without this,
// `<a href="javascript:...">` would be accepted, leading to XSS when content is
// rendered elsewhere (preview, server-side, other editors).
const ALLOWED_LINK_PROTOCOLS = ["http", "https", "mailto", "tel"];

function isSafeUrl(url: string): boolean {
  try {
    // URL relativi (es. "/page") non hanno protocol — li accettiamo.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
    const proto = new URL(url, "https://placeholder.local").protocol
      .replace(":", "")
      .toLowerCase();
    return ALLOWED_LINK_PROTOCOLS.includes(proto);
  } catch {
    return false;
  }
}

// Sanitise incoming HTML from external sources (initial set, server sync)
// by removing <script>, inline handlers (on*), and href: javascript:. This is
// intentionally minimal (no DOMPurify) to avoid a heavy dependency: it covers the
// most common vectors; for truly untrusted HTML the consumer should use DOMPurify
// at the app level.
function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(
    tpl.content,
    NodeFilter.SHOW_ELEMENT,
  );
  const toRemove: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      toRemove.push(node);
    } else {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) node.removeAttribute(attr.name);
        if (
          (name === "href" || name === "src" || name === "xlink:href") &&
          !isSafeUrl(attr.value)
        ) {
          node.removeAttribute(attr.name);
        }
      }
    }
    node = walker.nextNode() as Element | null;
  }
  toRemove.forEach((el) => el.remove());
  return tpl.innerHTML;
}

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

// Sync modelValue esterno → editor (es. reset dopo save)
watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && val !== editor.value.getHTML()) {
      editor.value.commands.setContent(
        sanitizeHtml((val as string) ?? ""),
        false,
      );
    }
  },
);

onBeforeUnmount(() => editor.value?.destroy());

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
  <div
    class="mapo-wyg-editor rounded border"
    :class="[
      errors?.length ? 'border-red-300' : 'border-gray-200',
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
        :disabled="readonly || disabled"
        :class="{ 'bg-gray-200': editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong>B</strong>
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="readonly || disabled"
        :class="{ 'bg-gray-200': editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em>I</em>
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="readonly || disabled"
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
        :disabled="readonly || disabled"
        :class="{ 'bg-gray-200': editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="readonly || disabled"
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
        :disabled="readonly || disabled"
        :class="{ 'bg-gray-200': editor.isActive('bulletList') }"
        icon="i-lucide-list"
        @click="editor.chain().focus().toggleBulletList().run()"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="readonly || disabled"
        :class="{ 'bg-gray-200': editor.isActive('orderedList') }"
        icon="i-lucide-list-ordered"
        @click="editor.chain().focus().toggleOrderedList().run()"
      />

      <USeparator orientation="vertical" class="mx-1 h-5" />

      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="readonly || disabled"
        icon="i-lucide-undo"
        @click="editor.chain().focus().undo().run()"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :disabled="readonly || disabled"
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
          :disabled="readonly || disabled || !hasMediaManager"
          @click="imagePickerOpen = true"
        />
      </UTooltip>
    </div>

    <!-- Editor content -->
    <EditorContent
      :editor="editor"
      class="prose prose-sm max-w-none px-3 py-2 focus-within:outline-none"
    />

    <p
      v-for="err in errors"
      :key="err"
      class="px-3 pb-2 text-sm text-red-500"
      role="alert"
    >
      {{ err }}
    </p>
  </div>

  <!-- Image picker dialog — only rendered when MapoMediaManagerDialog is globally available -->
  <component
    :is="MediaManagerDialog"
    v-if="hasMediaManager"
    v-model="imagePickerOpen"
    selection-mode="single"
    mime="image/*"
    @confirm="onImageConfirm"
  />
</template>

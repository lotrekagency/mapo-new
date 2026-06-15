<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import type { AnyExtension } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import type { EditorDescriptor } from "../../types/index.js";

const props = defineProps<{
  modelValue: unknown;
  descriptor: EditorDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

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

      <!-- Insert Image — enabled in Phase 6 when Media Manager is available -->
      <UTooltip
        text="Insert image (requires Media Manager — Phase 6)"
        :delay-open="300"
      >
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-image"
          disabled
        />
      </UTooltip>
    </div>

    <!-- Contenuto editor -->
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
</template>

/**
 * Scaffold templates.
 *
 * Modelled on the canonical recipes in `docs/howto/` and on the pages that
 * actually run in `apps/example-e2e`, so the generated code compiles and works
 * as-is. Types are imported from `mapomodule/types`, the aggregate a consuming
 * app installs.
 */
import { renderDescriptors, renderModel } from "./fields.js";
import type { ParsedField } from "./fields.js";
import type { ApiKnowledge } from "../types.js";

export interface TemplateInput {
  /** Resource name in kebab/snake, e.g. `articles`. */
  name: string;
  /** PascalCase singular, e.g. `Article`. */
  model: string;
  /** REST endpoint, e.g. `/api/articles`. */
  endpoint: string;
  /** Route base, e.g. `/articles`. */
  route: string;
  fields: ParsedField[];
  api?: ApiKnowledge;
}

export interface TemplateOutput {
  files: Array<{ path: string; content: string }>;
  notes: string[];
  docs: string[];
}

const PAGE_META = (label: string, icon: string) =>
  `definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "${label}",
  icon: "${icon}",
});`;

export function listPage(input: TemplateInput): TemplateOutput {
  const columns = input.fields
    .map(
      (field) =>
        `  { key: "${field.key}", label: "${field.label}", sortable: true },`,
    )
    .join("\n");

  return {
    files: [
      {
        path: `app/pages${input.route}/index.vue`,
        content: `<script setup lang="ts">
import type { ListColumn } from "mapomodule/types";

${PAGE_META(input.model + "s", "i-lucide-list")}

interface ${input.model} {
  id: number;
${renderModel(input.fields)}
}

const columns: ListColumn<${input.model}>[] = [
  { key: "id", label: "ID", class: "w-14 font-mono text-xs text-muted" },
${columns}
];
</script>

<template>
  <MapoList
    endpoint="${input.endpoint}"
    detail-base="${input.route}"
    :columns="columns"
    model-name="${input.model}"
  />
</template>
`,
      },
    ],
    notes: [
      `The list calls \`${input.endpoint}\` with \`?page=&search=&ordering=\` — the backend must paginate.`,
      `Row clicks navigate to \`${input.route}/<id>\`; scaffold the detail page next.`,
    ],
    docs: ["howto/crud-list.md", "uikit/list.md"],
  };
}

export function detailPage(input: TemplateInput): TemplateOutput {
  return {
    files: [
      {
        path: `app/pages${input.route}/[id].vue`,
        content: `<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

${PAGE_META(input.model, "i-lucide-file-pen")}

interface ${input.model} {
  id: number;
${renderModel(input.fields)}
}

const route = useRoute();
const id = computed(() => route.params.id as string);

const fields: FieldDescriptor<${input.model}>[] = [
${renderDescriptors(input.fields, input.api)}
];
</script>

<template>
  <MapoDetail
    :endpoint="'${input.endpoint}'"
    :id="id"
    :fields="fields"
    model-name="${input.model}"
    @saved="navigateTo('${input.route}')"
  />
</template>
`,
      },
    ],
    notes: [
      "`id` is `'new'` when creating: MapoDetail switches to POST on its own.",
      "Move fields to `sidebarFields` to render them in the sticky right column.",
    ],
    docs: ["howto/crud-detail.md", "uikit/detail.md"],
  };
}

export function standaloneForm(input: TemplateInput): TemplateOutput {
  return {
    files: [
      {
        path: `app/pages${input.route}/form.vue`,
        content: `<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

${PAGE_META(input.model + " form", "i-lucide-square-pen")}

interface ${input.model} {
${renderModel(input.fields)}
}

const repository = useCrud<${input.model}>("${input.endpoint}");
const model = ref<${input.model}>({} as ${input.model});
const errors = ref<Record<string, string[]>>({});
const saving = ref(false);
const snack = useSnackStore();

const fields: FieldDescriptor<${input.model}>[] = [
${renderDescriptors(input.fields, input.api)}
];

async function save() {
  saving.value = true;
  errors.value = {};
  try {
    await repository.create(model.value);
    snack.success("Saved");
  } catch (error) {
    // Mapo puts the backend payload on the error, so field errors map 1:1.
    errors.value = (error as { data?: Record<string, string[]> }).data ?? {};
    snack.error("Could not save");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="p-6 space-y-4">
    <MapoForm v-model="model" :fields="fields" :errors="errors" />
    <UButton :loading="saving" @click="save">Save</UButton>
  </div>
</template>
`,
      },
    ],
    notes: [
      "`useCrud` is auto-imported; no import statement is needed.",
      "Use this when you own the submit flow — otherwise MapoDetail does it for you.",
    ],
    docs: ["howto/form-standalone.md", "uikit/form/index.md"],
  };
}

export function customField(input: TemplateInput): TemplateOutput {
  const component = `${input.model}Field`;
  const type = input.name;

  return {
    files: [
      {
        path: `app/components/${component}.vue`,
        content: `<script setup lang="ts">
import type { CustomDescriptor } from "mapomodule/types";

// The contract a field component must implement — nothing more.
defineProps<{
  modelValue: string | null;
  descriptor: CustomDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();
</script>

<template>
  <UFormField :label="descriptor.label" :error="errors?.[0]">
    <UInput
      :model-value="modelValue ?? ''"
      :disabled="disabled || readonly"
      @update:model-value="emit('update:modelValue', String($event) || null)"
    />
  </UFormField>
</template>
`,
      },
      {
        path: `app/plugins/${type}-field.ts`,
        content: `export default defineNuxtPlugin(() => {
  // Registers the type globally: any descriptor can now use \`type: "${type}"\`.
  defineFormField("${type}", () => import("~/components/${component}.vue"), {
    attrs: {},
  });
});
`,
      },
    ],
    notes: [
      `Use it with \`{ key: "…", type: "${type}", label: "…" }\`.`,
      "Registering an existing type warns unless you pass `{ override: true }`.",
      "Types added this way are invisible to `mapo_inspect_app`, which reads a build-time snapshot.",
    ],
    docs: ["uikit/form/registry.md", "uikit/form/custom-fields.md"],
  };
}

export function loginPage(): TemplateOutput {
  return {
    files: [
      {
        path: "app/pages/login.vue",
        content: `<script setup lang="ts">
// The login page must opt out of the admin layout.
definePageMeta({ layout: false });
</script>

<template>
  <MapoLogin />
</template>
`,
      },
    ],
    notes: [
      "The path must match `mapo.loginUrl` (default `/login`), or the auth middleware redirects to a 404.",
      "MapoLogin posts to `mapo.authLoginUrl` and then reads `mapo.userInfoApi`.",
    ],
    docs: ["howto/auth-permissions.md", "uikit/login.md"],
  };
}

export function themeOverride(): TemplateOutput {
  return {
    files: [
      {
        path: "app/assets/css/mapo.css",
        content: `@import "tailwindcss";
@import "@nuxt/ui";

/* Mapo design tokens. Override only what you need: everything else keeps
   the defaults shipped by @mapomodule/uikit. */
:root {
  --ui-primary: var(--color-green-600);
  --mapo-sidebar-width: 16rem;
  --mapo-topbar-height: 64px;
}

.dark {
  --ui-primary: var(--color-green-400);
}
`,
      },
      {
        path: "nuxt.config.snippet.ts",
        content: `// Add to nuxt.config.ts — the CSS must go through the uikit module so
// Tailwind v4 and @nuxt/ui process it in the same pipeline.
export default defineNuxtConfig({
  mapo: {
    uikit: {
      css: "~/assets/css/mapo.css",
      ui: {
        button: { defaultVariants: { size: "md" } },
      },
    },
  },
});
`,
      },
    ],
    notes: [
      "`nuxt.config.snippet.ts` is a fragment to merge by hand, not a file Nuxt loads.",
      "To replace a whole component instead of restyling it, use the MapoOverride system.",
    ],
    docs: ["howto/theming.md", "uikit/theming.md", "uikit/mapoverride.md"],
  };
}

export function backendProxy(input: TemplateInput): TemplateOutput {
  return {
    files: [
      {
        path: "server/middleware/backend-proxy.ts",
        content: `/**
 * Proxies /api/* to the backend, keeping cookies on the app's own origin so
 * the session survives without CORS.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  if (!url.pathname.startsWith("/api/")) return;

  const target = process.env.BACKEND_URL ?? "http://localhost:8000";

  return proxyRequest(event, \`\${target}\${url.pathname}\${url.search}\`, {
    // Forward the session cookie both ways.
    cookieDomainRewrite: url.host,
    headers: { host: new URL(target).host },
  });
});
`,
      },
    ],
    notes: [
      `Point \`mapo.authLoginUrl\`, \`mapo.userInfoApi\` and endpoints such as \`${input.endpoint}\` at the proxied paths.`,
      "For a Django/DRF backend, CSRF needs the token header — see the recipe.",
    ],
    docs: ["howto/backend-integration.md", "modules/camomilla.md"],
  };
}

export function menuPage(input: TemplateInput): TemplateOutput {
  return {
    files: [
      {
        path: `app/pages${input.route}/[id].vue`,
        content: `<script setup lang="ts">
${PAGE_META("Menu", "i-lucide-menu")}

const route = useRoute();
const id = computed(() => route.params.id as string);
</script>

<template>
  <MapoMenuManager
    :endpoint="'${input.endpoint}'"
    :id="id"
    page-types-endpoint="${input.endpoint}/page_types"
  />
</template>
`,
      },
    ],
    notes: [
      "The backend must expose the menu tree and the available page types.",
      "Nodes are reordered by drag & drop; the tree is saved as a whole.",
    ],
    docs: ["howto/menu-manager.md", "uikit/menu-manager.md"],
  };
}

export function mediaPage(input: TemplateInput): TemplateOutput {
  return {
    files: [
      {
        path: `app/pages${input.route}/index.vue`,
        content: `<script setup lang="ts">
${PAGE_META("Media", "i-lucide-image")}
</script>

<template>
  <MapoMediaManager />
</template>
`,
      },
    ],
    notes: [
      "Configure `mapo.uikit.media.endpoints` unless an integration already serves them.",
      "In a form, pick media with the `media`, `media-m2m` or `enhanced-media` field types.",
    ],
    docs: ["howto/media-manager.md", "uikit/media.md"],
  };
}

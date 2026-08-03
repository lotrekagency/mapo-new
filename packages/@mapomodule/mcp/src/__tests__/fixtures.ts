import {
  buildIndex,
  chunkMarkdown,
  KNOWLEDGE_VERSION,
} from "../runtime/core/indexer.js";
import type { MapoAppManifest } from "../index.js";
import type { MapoToolContext } from "../runtime/core/tool-spec.js";
import type { ApiKnowledge, DocsKnowledge } from "../runtime/core/types.js";

/** Builds an in-memory knowledge base from `path → markdown` pairs. */
export function makeKnowledge(files: Record<string, string>): DocsKnowledge {
  const chunks = Object.entries(files).flatMap(([path, markdown]) =>
    chunkMarkdown(path, markdown),
  );

  return {
    version: KNOWLEDGE_VERSION,
    generatedAt: new Date(0).toISOString(),
    docsRoot: "docs",
    chunks,
    index: buildIndex(chunks),
  };
}

export const CRUD_LIST_DOC = `# CRUD list view

Build a resource list page using MapoList.

## Minimal example

\`\`\`vue
<MapoList endpoint="/api/articles" detail-base="/articles" />
\`\`\`

## Bulk actions

Pass \`bulkActions\` to run an operation on every selected row.

## Quick edit

Inline editing of a row uses the field registry with \`type: "text"\`.
`;

export const CUSTOM_FIELDS_DOC = `# Custom fields

Register your own field component in the form registry.

## Registering a component

Use \`defineFormField\` in a plugin to add a new field type.

## Overriding defaults

Set \`mapoForm.fields\` in nuxt.config to override attrs per type.
`;

/** Minimal API surface fixture, shaped like the real extraction output. */
export function makeApi(): ApiKnowledge {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    components: [
      {
        name: "MapoList",
        pkg: "@mapomodule/uikit",
        file: "packages/@mapomodule/uikit/src/runtime/components/MapoList.vue",
        description: "Paginated resource list.",
        props: [
          { name: "endpoint", type: "string", required: true },
          {
            name: "columns",
            type: "ListColumn<T>[]",
            required: false,
            default: "[]",
            description: "Columns to render.",
          },
        ],
        events: [{ name: "update:items" }],
        slots: [{ name: "head" }],
        exposed: [],
        docs: ["uikit/list.md#mapolist"],
      },
      {
        name: "MapoDetail",
        pkg: "@mapomodule/uikit",
        file: "packages/@mapomodule/uikit/src/runtime/components/MapoDetail.vue",
        props: [{ name: "id", type: "string | number", required: true }],
        events: [{ name: "saved" }],
        slots: [],
        exposed: [],
        docs: [],
      },
    ],
    fieldTypes: [
      {
        type: "select",
        component: "NuiSelectMenu",
        descriptor: "SelectDescriptor",
        description: "Single or multi-value select menu.",
        attrs: [
          {
            name: "items",
            type: "readonly string[]",
            required: true,
            description: "Choices.",
          },
          { name: "multiple", type: "boolean", required: false },
        ],
        defaultAttrs: { labelKey: "text" },
        docs: ["uikit/form/add-fields.md#select"],
      },
      {
        type: "text",
        component: "NuiInput",
        descriptor: "TextDescriptor",
        attrs: [{ name: "placeholder", type: "string", required: false }],
        docs: [],
      },
    ],
    fieldCommon: [
      { name: "key", type: "DeepKeyOf<T>", required: true },
      { name: "label", type: "string", required: false },
    ],
    composables: [
      {
        name: "useCrud",
        pkg: "@mapomodule/core",
        file: "packages/@mapomodule/core/src/runtime/api/crud.ts",
        signature: "<T>(endpoint: string) => CrudRepository<T>",
        description: "Typed CRUD factory.",
        docs: ["modules/core.md#usecrud"],
      },
      {
        name: "useMediaStore",
        pkg: "@mapomodule/uikit",
        file: "packages/@mapomodule/uikit/src/runtime/stores/media.ts",
        docs: [],
      },
    ],
  };
}

/**
 * A healthy app snapshot: `@nuxt/ui` first, a login page, real auth endpoints,
 * one admin route, bundled locales only. Doctor rules should stay silent on it.
 */
export function makeManifest(
  overrides: Partial<MapoAppManifest> = {},
): MapoAppManifest {
  return {
    rootDir: "/tmp/app",
    dev: true,
    modules: [
      { name: "@mapomodule/core", version: "0.0.0" },
      { name: "@mapomodule/uikit", version: "0.0.0" },
      { name: "@mapomodule/form", version: "0.0.0" },
    ],
    moduleOrder: ["@nuxt/ui", "mapomodule"],
    config: {
      mapoCore: {
        authLoginUrl: "/api/backend/login",
        userInfoApi: "/api/backend/me/",
        logoutUrl: "/api/backend/logout",
        loginUrl: "/login",
      },
    },
    fieldTypes: [
      { type: "text", source: "default" },
      { type: "select", source: "default" },
    ],
    components: ["MapoList", "MapoDetail"],
    routes: [{ path: "/login" }, { path: "/articles" }],
    locales: ["en", "it"],
    ...overrides,
  };
}

/** Tool context backed by the fixtures above. */
export function makeContext(
  files: Record<string, string> = {
    "howto/crud-list.md": CRUD_LIST_DOC,
    "uikit/form/custom-fields.md": CUSTOM_FIELDS_DOC,
  },
  manifest: MapoAppManifest | null = makeManifest(),
): MapoToolContext {
  const docs = makeKnowledge(files);
  const api = makeApi();
  return { knowledge: () => docs, api: () => api, manifest: () => manifest };
}

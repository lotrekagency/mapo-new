/**
 * Curated task → documentation map.
 *
 * BM25 answers "which section mentions these words"; it cannot answer "which
 * page is the canonical recipe for this task" — API reference tables often win
 * on raw term frequency. This table encodes that intent, and is the file to
 * update when a new feature ships.
 */
import { tokenize } from "./tokenize.js";

export interface Recipe {
  id: string;
  /** Task phrased the way a developer would ask for it. */
  task: string;
  /** Extra vocabulary that should match this recipe. */
  keywords: string[];
  /** Canonical doc path, relative to the docs root. */
  doc: string;
  /** Optional section inside `doc`. */
  heading?: string;
  /** Related docs worth reading next. */
  seeAlso?: string[];
  summary: string;
}

export const RECIPES: Recipe[] = [
  {
    id: "concepts",
    task: "Understand how Mapo fits together",
    keywords: [
      "overview",
      "architecture",
      "packages",
      "concepts",
      "mental model",
      "how it works",
    ],
    doc: "guide/concepts.md",
    seeAlso: ["guide/architecture-flows.md", "guide/getting-started.md"],
    summary:
      "The packages, the backend contract, declarative pages, the form engine and the customization layers.",
  },
  {
    id: "first-admin-page",
    task: "Create the first admin page",
    keywords: [
      "scaffold",
      "start",
      "setup",
      "layout",
      "definePageMeta",
      "dashboard",
      "sidebar entry",
      "install",
    ],
    doc: "howto/first-admin-page.md",
    seeAlso: ["guide/getting-started.md"],
    summary:
      "Page meta, mapo-default layout, auth middleware and sidebar registration.",
  },
  {
    id: "crud-list",
    task: "Build a CRUD list page",
    keywords: [
      "MapoList",
      "table",
      "columns",
      "pagination",
      "filters",
      "tabs",
      "bulk",
      "quick edit",
      "search",
      "sorting",
    ],
    doc: "howto/crud-list.md",
    seeAlso: ["uikit/list.md"],
    summary:
      "MapoList with server-side pagination, filters, tabs, bulk actions and quick edit.",
  },
  {
    id: "crud-detail",
    task: "Build a CRUD detail or edit page",
    keywords: [
      "MapoDetail",
      "form",
      "save",
      "delete",
      "translations",
      "sidebar fields",
      "patch",
    ],
    doc: "howto/crud-detail.md",
    seeAlso: ["uikit/detail.md", "uikit/form/index.md"],
    summary:
      "MapoDetail wired to useCrud, with body/sidebar field descriptors and save flow.",
  },
  {
    id: "standalone-form",
    task: "Use the form engine outside a detail page",
    keywords: [
      "MapoForm",
      "useMapoForm",
      "standalone",
      "modal",
      "wizard",
      "custom submit",
    ],
    doc: "howto/form-standalone.md",
    seeAlso: ["uikit/form/composable.md"],
    summary:
      "MapoForm / useMapoForm driven by your own state and submit handler.",
  },
  {
    id: "field-types",
    task: "Pick a form field type",
    keywords: [
      "descriptor",
      "field type",
      "text",
      "select",
      "editor",
      "repeater",
      "seo",
      "map",
      "fks",
      "m2m",
      "datetime",
    ],
    doc: "uikit/form/add-fields.md",
    seeAlso: ["uikit/form/index.md"],
    summary:
      "Every built-in field type, the component behind it and its attrs.",
  },
  {
    id: "block-editor",
    task: "Build a block editor with a block picker (repeater with templates)",
    keywords: [
      "block editor",
      "block picker",
      "repeater templates",
      "page builder",
      "RepeaterTemplate",
      "picker",
      "content blocks",
    ],
    doc: "howto/form-advanced.md",
    heading: "Describe blocks and choose them in a picker",
    seeAlso: ["uikit/form/api.md", "uikit/form/add-fields.md"],
    summary:
      "attrs.templates with label, icon, image and category, and attrs.picker (select or modal).",
  },
  {
    id: "custom-field",
    task: "Create and register a custom field type",
    keywords: [
      "defineFormField",
      "registry",
      "custom component",
      "mapping",
      "own field",
      "extend fields",
    ],
    doc: "uikit/form/registry.md",
    heading: "Add types globally — `defineFormField()` (recommended)",
    seeAlso: ["uikit/form/custom-fields.md", "uikit/form/reusable-fields.md"],
    summary:
      "Register a component in the field registry, then use it through descriptor.type.",
  },
  {
    id: "form-validation",
    task: "Validate form fields",
    keywords: [
      "validate",
      "validateAsync",
      "required",
      "errors",
      "rules",
      "async validation",
    ],
    doc: "uikit/form/validation.md",
    summary:
      "Sync and debounced async validation on descriptors, plus error display.",
  },
  {
    id: "form-i18n",
    task: "Make form fields translatable",
    keywords: [
      "translatable",
      "synci18n",
      "translations",
      "languages",
      "lang switch",
    ],
    doc: "uikit/form/i18n.md",
    seeAlso: ["howto/i18n.md"],
    summary:
      "translatable descriptors, per-language models and the detail language switcher.",
  },
  {
    id: "media-manager",
    task: "Use the media manager and media fields",
    keywords: [
      "upload",
      "image",
      "gallery",
      "folders",
      "MapoMediaManager",
      "enhanced-media",
      "MapoDropArea",
    ],
    doc: "howto/media-manager.md",
    seeAlso: ["uikit/media.md"],
    summary:
      "Media endpoints configuration, media fields and the picker dialog.",
  },
  {
    id: "menu-manager",
    task: "Build a navigation menu editor",
    keywords: [
      "MapoMenuManager",
      "tree",
      "drag and drop",
      "nodes",
      "navigation",
    ],
    doc: "howto/menu-manager.md",
    seeAlso: ["uikit/menu-manager.md"],
    summary:
      "Tree editor for menus with drag-and-drop nodes and per-node forms.",
  },
  {
    id: "i18n",
    task: "Translate the admin UI",
    keywords: [
      "locale",
      "language",
      "vue-i18n",
      "catalog",
      "useMapoT",
      "messages",
    ],
    doc: "howto/i18n.md",
    seeAlso: ["modules/i18n.md"],
    summary:
      "Locale setup, overriding Mapo strings and adding your own catalogs.",
  },
  {
    id: "auth-permissions",
    task: "Protect routes with auth and permissions",
    keywords: [
      "login",
      "middleware",
      "roles",
      "useCanAccessRoute",
      "session",
      "logout",
      "django permissions",
    ],
    doc: "howto/auth-permissions.md",
    seeAlso: ["uikit/login.md"],
    summary:
      "Auth middleware, permission route meta and the Django-backed permission model.",
  },
  {
    id: "feedback",
    task: "Show toasts and confirm dialogs",
    keywords: [
      "snackbar",
      "toast",
      "notification",
      "confirm",
      "dialog",
      "alert",
    ],
    doc: "howto/feedback.md",
    seeAlso: ["uikit/feedback.md"],
    summary: "Snackbar and confirm stores, plus their root components.",
  },
  {
    id: "theming",
    task: "Theme and restyle the admin",
    keywords: [
      "css variables",
      "tailwind",
      "nuxt ui",
      "colors",
      "dark mode",
      "tokens",
      "design",
      "primary color",
    ],
    doc: "howto/theming.md",
    seeAlso: ["uikit/theming.md"],
    summary:
      "CSS tokens, Nuxt UI defaults and where to put the override stylesheet.",
  },
  {
    id: "override-components",
    task: "Replace or extend a Mapo component",
    keywords: [
      "MapoOverride",
      "slots",
      "swap component",
      "customize layout",
      "topbar",
      "sidebar",
    ],
    doc: "uikit/mapoverride.md",
    seeAlso: ["uikit/layout.md"],
    summary:
      "The MapoOverride system and the layout slots that avoid full replacements.",
  },
  {
    id: "backend-integration",
    task: "Connect a custom or Django backend",
    keywords: [
      "api",
      "endpoints",
      "csrf",
      "camomilla",
      "drf",
      "proxy",
      "useCrud",
      "rest",
      "fastapi",
      "laravel",
      "jwt",
    ],
    doc: "howto/backend-integration.md",
    seeAlso: ["modules/camomilla.md", "modules/api.md"],
    summary:
      "Endpoint conventions, CSRF/session handling and the camomilla integration.",
  },
  {
    id: "migration",
    task: "Migrate a v1 project to v2",
    keywords: ["v1", "upgrade", "legacy", "vuex", "axios", "breaking changes"],
    doc: "migration/v1-to-v2.md",
    summary: "What changed between Mapo v1 and v2 and how to port each piece.",
  },
  {
    id: "conditional-fields",
    task: "Show or hide form fields based on other values",
    keywords: [
      "visible",
      "conditional",
      "whenAny",
      "matchesField",
      "depends on",
      "progressive disclosure",
    ],
    doc: "uikit/form/progressive-disclosure.md",
    seeAlso: ["howto/form-advanced.md"],
    summary:
      "visible and show predicates built with the when/matchesField matcher helpers.",
  },
  {
    id: "form-draft",
    task: "Autosave form drafts",
    keywords: ["draft", "autosave", "useFormDraft", "restore", "unsaved"],
    doc: "uikit/form/draft.md",
    seeAlso: ["howto/crud-detail.md"],
    summary:
      "useFormDraft keeps unsaved edits in localStorage and offers to restore them on the next visit.",
  },
  {
    id: "schema-to-form",
    task: "Generate form fields from a JSON Schema",
    keywords: [
      "json schema",
      "useFormFromSchema",
      "openapi",
      "drf-spectacular",
      "pydantic",
      "serializer",
    ],
    doc: "uikit/form/schema-to-form.md",
    seeAlso: ["howto/form-advanced.md"],
    summary:
      "useFormFromSchema turns a JSON Schema (DRF, Pydantic) into field descriptors you can extend.",
  },
  {
    id: "form-to-schema",
    task: "Describe a form as JSON Schema",
    keywords: [
      "fieldsToJsonSchema",
      "form to json schema",
      "export the fields",
      "serialize the form",
      "round trip",
      "x-mapo-field",
      "x-mapo-attrs",
    ],
    doc: "uikit/form/schema-to-form.md",
    heading: "From form to JSON Schema",
    seeAlso: ["uikit/form/custom-fields.md"],
    summary:
      "fieldsToJsonSchema writes a form's descriptors as JSON Schema, and useFormFromSchema reads it back into the same descriptors.",
  },
  {
    id: "descriptor-extensions",
    task: "Add typed properties of your own to field descriptors",
    keywords: [
      "FieldExtensions",
      "extend the descriptor",
      "declare module",
      "module augmentation",
      "custom descriptor property",
      "typed property",
    ],
    doc: "uikit/form/custom-fields.md",
    heading: "Add your own descriptor properties",
    seeAlso: ["uikit/form/schema-to-form.md"],
    summary:
      "FieldExtensions adds typed properties of your own to every descriptor through module augmentation; the property option of fieldsToJsonSchema writes them into the schema.",
  },
  {
    id: "form-slots",
    task: "Customize how a form field renders with slots",
    keywords: [
      "field slot",
      "hint",
      "above",
      "below",
      "replace a field",
      "group slot",
    ],
    doc: "uikit/form/slots.md",
    summary:
      "Per-field, per-group and global slots that wrap, extend or replace how fields render.",
  },
  {
    id: "focus-mode",
    task: "Focus mode for repeater items and long fields",
    keywords: [
      "focus mode",
      "useFocusMode",
      "fullscreen",
      "field expand",
      "MapoFocusPortal",
      "breadcrumb",
    ],
    doc: "uikit/form/focus-mode.md",
    seeAlso: ["uikit/form/field-expand.md"],
    summary:
      "Open a repeater item in a fullscreen view, or expand a single field in place.",
  },
  {
    id: "field-annotations",
    task: "Annotate the fields an assistant filled or that need a review",
    keywords: [
      "annotations",
      "annotate",
      "mark a field",
      "field badge",
      "tab count",
      "suggested value",
      "imported value",
      "review note",
      "outside the descriptor",
      "MapoFormAnnotation",
      "useFieldAnnotation",
    ],
    doc: "uikit/form/annotations.md",
    seeAlso: ["uikit/form/slots.md", "uikit/form/api.md"],
    summary:
      "A reactive map keyed by value path on MapoForm, MapoDetail or useMapoForm: a mark with a popover next to the label and badges on tabs and repeater items, without remounting the fields.",
  },
  {
    id: "sidebar-navigation",
    task: "Build the sidebar navigation",
    keywords: [
      "sidebar",
      "nested menu",
      "parent",
      "icon",
      "label",
      "sidebarFooter",
      "sidebarOrder",
      "reorder menu",
      "route meta",
    ],
    doc: "uikit/sidebar.md",
    seeAlso: ["howto/first-admin-page.md"],
    summary:
      "Route metadata builds the sidebar tree without menu config; use sidebarOrder to sort sibling entries.",
  },
  {
    id: "login-page",
    task: "Customize the login page",
    keywords: [
      "MapoLogin",
      "sign in",
      "login form",
      "login redirect",
      "branding",
    ],
    doc: "uikit/login.md",
    seeAlso: ["howto/auth-permissions.md"],
    summary:
      "The built-in /login page: its slots, the redirect after login and error handling.",
  },
  {
    id: "imports",
    task: "Know what to import and from where",
    keywords: [
      "import",
      "auto-import",
      "import type",
      "mapomodule/types",
      "TS2307",
      "cannot find module",
    ],
    doc: "guide/imports.md",
    seeAlso: ["guide/known-limitations.md"],
    summary:
      "Composables and components are auto-imported, types come from mapomodule/types, utils are imported explicitly.",
  },
  {
    id: "troubleshooting",
    task: "Troubleshoot compatibility and version problems",
    keywords: [
      "module order",
      "nuxt ui first",
      "error",
      "tested versions",
      "peer dependencies",
      "dedupe",
      "duplicate vue",
    ],
    doc: "guide/compatibility.md",
    seeAlso: ["guide/known-limitations.md"],
    summary:
      "Tested versions, what to declare in the app, module order and the common problems.",
  },
  {
    id: "utils",
    task: "Merge, diff and format with the utility helpers",
    keywords: [
      "deepMerge",
      "objectDiff",
      "slugify",
      "formatDate",
      "humanFileSize",
      "normalizeEndpoint",
      "debounce",
    ],
    doc: "modules/utils.md",
    seeAlso: ["modules/api.md"],
    summary:
      "Typed helpers from @mapomodule/utils: merging, diffing, formatting, slugs and endpoints.",
  },
  {
    id: "camomilla",
    task: "Use the Camomilla CMS integration",
    keywords: [
      "camomilla",
      "path rewrite",
      "session cookie",
      "django cms",
      "media adapter",
    ],
    doc: "modules/camomilla.md",
    seeAlso: ["howto/backend-integration.md"],
    summary:
      "The Camomilla integration: proxy options, path rewriting, the media adapter and session cookies.",
  },
  {
    id: "ai-assistant",
    task: "Set up an AI coding assistant",
    keywords: ["mcp", "claude", "copilot", "cursor", "agent", "mapo-mcp"],
    doc: "howto/ai-assistant.md",
    seeAlso: ["modules/mcp.md"],
    summary:
      "Connect Claude Code, Copilot or Cursor to the Mapo MCP server over stdio or HTTP.",
  },
  {
    id: "form-devtools",
    task: "Inspect forms in Nuxt DevTools",
    keywords: [
      "devtools",
      "debug form",
      "registry warning",
      "inspect",
      "_mapo",
    ],
    doc: "uikit/form/devtools.md",
    summary:
      "The Mapo Forms tab: the module config and the live field registry your forms read.",
  },
];

export interface RecipeMatch extends Recipe {
  score: number;
}

const TASK_WEIGHT = 1.5;
const KEYWORD_WEIGHT = 1;
/** Roughly "two distinctive words, or one distinctive word in the task". */
const MATCH_THRESHOLD = 3;

interface RecipeTerms {
  recipe: Recipe;
  task: Set<string>;
  keywords: Set<string>;
}

const RECIPE_TERMS: RecipeTerms[] = RECIPES.map((recipe) => ({
  recipe,
  task: new Set(tokenize(recipe.task)),
  keywords: new Set(tokenize(recipe.keywords.join(" "))),
}));

/**
 * How many recipes mention each term. Words shared by most recipes ("field",
 * "page", "custom") carry little signal; "upload" or "permission" carry a lot.
 */
const DOCUMENT_FREQUENCY = new Map<string, number>();
for (const entry of RECIPE_TERMS) {
  for (const term of new Set([...entry.task, ...entry.keywords])) {
    DOCUMENT_FREQUENCY.set(term, (DOCUMENT_FREQUENCY.get(term) ?? 0) + 1);
  }
}

function idf(term: string): number {
  const frequency = DOCUMENT_FREQUENCY.get(term);
  return frequency ? Math.log(1 + RECIPES.length / frequency) : 0;
}

/** Weighted term overlap over task + keywords; returns only confident hits. */
export function matchRecipes(query: string, limit = 2): RecipeMatch[] {
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size) return [];

  const matches: RecipeMatch[] = [];

  for (const { recipe, task, keywords } of RECIPE_TERMS) {
    let score = 0;
    for (const term of queryTerms) {
      if (task.has(term)) score += TASK_WEIGHT * idf(term);
      else if (keywords.has(term)) score += KEYWORD_WEIGHT * idf(term);
    }

    if (score >= MATCH_THRESHOLD)
      matches.push({ ...recipe, score: Number(score.toFixed(2)) });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

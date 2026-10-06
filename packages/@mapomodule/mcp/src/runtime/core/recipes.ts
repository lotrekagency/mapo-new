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

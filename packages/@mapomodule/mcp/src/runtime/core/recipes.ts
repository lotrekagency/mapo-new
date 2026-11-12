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
    id: "detail-context",
    task: "Use the record and state of a detail page from a component inside it",
    keywords: [
      "useMapoDetail",
      "detail context",
      "inside MapoDetail",
      "current record",
      "record being edited",
      "shared OPTIONS",
      "state in the draft",
      "draft part",
    ],
    doc: "uikit/detail.md",
    heading: "How to: read the detail from a component inside it",
    seeAlso: ["uikit/form/annotations.md"],
    summary:
      "useMapoDetail() gives a component inside MapoDetail the record, the fields rendered, languages, state, save(), onSaved(), an annotations channel and draft.part(), which keeps the component's own state in the page's draft, restored, discarded and cleared with the record's values.",
  },
  {
    id: "detail-extensions",
    task: "Add an action or a section to every detail page",
    keywords: [
      "defineDetailExtension",
      "detail extension",
      "every detail page",
      "action above save",
      "MapoDetailExtensions",
      "extensions prop",
    ],
    doc: "uikit/detail.md",
    heading: "How to: add an action to every detail page",
    seeAlso: ["uikit/api.md"],
    summary:
      "defineDetailExtension(), from a plugin, adds a component above Save or above the form of every MapoDetail; pages pick them with the extensions prop.",
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
    keywords: [
      "draft",
      "autosave",
      "useFormDraft",
      "restore",
      "unsaved",
      "noDraft",
      "saved draft",
    ],
    doc: "uikit/form/draft.md",
    seeAlso: ["uikit/detail.md", "howto/crud-detail.md"],
    summary:
      'useFormDraft keeps unsaved edits in localStorage and offers to restore them on the next visit. MapoDetail does it with :draft="true", and useMapoForm with draftKey: per user, without the fields marked noDraft wherever their value is (every language, dotted keys, repeater items), new records included once they hold a value.',
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
    id: "schema-sources",
    task: "Build a form from DRF OPTIONS metadata or an OpenAPI document",
    keywords: [
      "drf metadata",
      "options metadata",
      "actions.POST",
      "drfMetadataToJsonSchema",
      "openApiToJsonSchema",
      "metadataToJsonSchema",
      "schemaFromMetadata",
      "placeholder field",
    ],
    doc: "uikit/form/schema-to-form.md",
    heading: "From DRF metadata and OpenAPI",
    seeAlso: ["uikit/detail.md"],
    summary:
      "drfMetadataToJsonSchema and openApiToJsonSchema read what a DRF backend publishes as JSON Schema; MapoDetail derives its fields from the OPTIONS metadata.",
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
  {
    id: "ai-setup",
    task: "Turn on the AI module and Magic Fill with a guided setup",
    keywords: [
      "set up the ai",
      "configure the ai",
      "enable the ai module",
      "guided setup",
      "what can the ai do",
      "mapo_ai_setup",
      "mapo-ai-setup",
      "ai tokens",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Enable the module",
    seeAlso: ["modules/mcp.md", "howto/magic-fill.md"],
    summary:
      "Experimental: setting mapo.ai in nuxt.config.ts installs @mapomodule/ai, and a provider turns Magic Fill on in every MapoDetail. The mapo_ai_setup tool, or the mapo-ai-setup prompt, asks the developer what the AI is for, says what the module can and cannot do for it, and proposes the configuration, the environment variables (names only), the keys and tokens, and the server plugins.",
  },
  {
    id: "ai-run",
    task: "Ask the AI to fill a record from a source",
    keywords: [
      "mapo.ai",
      "language model",
      "_mapo/ai/run",
      "extract records",
      "field outcomes",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Ask the AI",
    seeAlso: ["uikit/form/schema-to-form.md"],
    summary:
      "Experimental, opt-in with mapo.ai: POST /_mapo/ai/run sends a record's backend schema and form fields with a source to an enabled provider and answers one checked outcome per field; useMapoAiFill() applies it to a detail form.",
  },
  {
    id: "ai-fill",
    task: "Fill a detail form with the AI from a pasted text",
    keywords: [
      "useMapoAiFill",
      "pasted text",
      "fill the form",
      "detail extension",
      "verified values",
      "undo",
      "already holds",
      "related records",
      "relationChoices",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Fill a detail form",
    seeAlso: ["uikit/detail.md", "uikit/form/annotations.md"],
    summary:
      "Experimental: in a detail extension, useMapoAiFill(detail), with the context of useMapoDetail(), sends the form's fields and the backend schema from OPTIONS with a source to run, writes each value a quote verifies into an empty field it shows and marks the others to apply, pick, set by hand or ignore, each mark with the words of the source that prove it; the mark of a replacement says what it replaces, and a value the field already holds is unchanged. Related records (fks and m2m fields with an endpoint) are looked up with the operator's session: the AI picks from the records of a relation that has 50 at most, or writes a name searched with ?search=; a record found with the AI's very name goes in as a verified value, one under another name waits with Apply, several are candidates to pick on the field's mark (choose()), and an m2m adds the records found after the field's own. The answers of a session add up: keep() or a change in the field makes a value the operator's, undo() puts back every answer's values, newest first, and a save of the record ends the session. snapshot() and resume() keep the session in a draft and take it back, read as outside data.",
  },
  {
    id: "ai-field-options",
    task: "Guide the AI on one field, keep a field from it, or keep a relation's records from the provider",
    keywords: [
      "x-mapo-ai",
      "ai.hint",
      "hint",
      "ai.exclude",
      "list: false",
      "keep a field from the ai",
      "relation names",
      "relationChoices",
      "mapoAiFieldsSchema",
      "privacy",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Guide a field",
    seeAlso: ["howto/magic-fill.md", "uikit/form/custom-fields.md"],
    summary:
      "Experimental: with @mapomodule/ai installed, a field descriptor takes ai (declared on FieldExtensions): { hint } tells the model what to take and how, { exclude: true } keeps the field away from the AI, { list: false } keeps a relation's records from the provider (they are never listed, even when 50 or fewer; the AI writes the name it reads and Magic Fill searches it with ?search= after the answer). A backend's schema says the same with x-mapo-ai; what either side says holds, inside a repeater's items too, and the gateway leaves out the records of an unlisted relation even from a request that lists them. Magic Fill and useMapoAiFill() send them; a page that calls POST /_mapo/ai/run itself sends its fields with mapoAiFieldsSchema(fields), auto-imported, since fieldsToJsonSchema(fields) leaves them out.",
  },
  {
    id: "ai-magic-fill",
    task: "Use Magic Fill, the AI panel of detail pages",
    keywords: [
      "magic fill",
      "magicFill",
      "disable",
      "useMapoAiMagicFill",
      "MapoAiMagicFillPanel",
      "what i send to the ai",
      "run/preview",
      "cancel the call",
      "undo all",
      "proposals without proof",
      "apply selected",
      "before and after",
      "items of a list",
      "after a reload",
      "related records",
      "no quotes",
      "evidence",
      "next to check",
      "magic fill error",
      "experimental",
    ],
    doc: "howto/magic-fill.md",
    seeAlso: ["modules/ai.md", "uikit/detail.md", "uikit/mapoverride.md"],
    summary:
      "Experimental: with mapo.ai and uikit, every MapoDetail gets Magic Fill: a button in the sidebar card opens a panel (a text, files read through read or links read through read/link, the operator's instructions, What I send to the AI from run/preview, the provider and model, Extract), and a banner above the form follows the call, with Cancel, and sums up the session, with Undo all: a second extraction keeps the first one's marks, Keep or a change makes a value the operator's, and Save ends the session. Below the summary, the preview lists the values that wait, each with a tick: to fill (empty fields, ticked), to replace (shown before and after, never ticked from the start) and proposals without proof; Apply selected writes the ticked ones, the others keep waiting, and Ignore all ignores them. A value the record already holds is no replacement: the summary counts it. A list of items, as a repeater's, is chosen item by item, its verified items ticked from the start; the chosen items go after the record's own, never one it holds already. Related records show by their names: one found under another name waits unticked, and a record to pick inside an item gets its own mark once the item is in. definePageMeta({ magicFill: { evidence: false } }) asks the AI for no quotes on a page: every value then waits, marked. On a page with drafts, the session goes into MapoDetail's draft: after a reload, Restore brings back the marks with their quotes, the summary and Undo all, never the source. What I send to the AI shows every user of the AI the rules as the model reads them, the app's, the mapo-ai:prompt hooks' and the admins' included. Next to check, in the banner, takes the operator to each mark that waits, in the order of the form: the tab, group or list item that holds the field opens and the field takes the focus (revealField of the detail's context). The banner's errors say what to do: a key or a model taken away while the page was open (run answers data.reason) makes Magic Fill ask status again. Fields are prepared with their labels, help texts and ai on the descriptor: hint, exclude, and list: false for a relation whose names must not reach the provider. mapo.ai.magicFill: false, definePageMeta({ magicFill: false }) or MapoDetail's extensions prop turn it off; the components can be replaced with MapoOverride, and useMapoAiMagicFill(detail, { part }) gives their state and tells the other parts an override is there.",
  },
  {
    id: "ai-read-files",
    task: "Give the AI a file instead of a pasted text: Markdown, a saved HTML page, a CSV or an Excel sheet",
    keywords: [
      "useMapoAiRead",
      "_mapo/ai/read",
      "upload a file",
      "file input",
      "excel",
      "xlsx",
      "csv",
      "spreadsheet",
      "html page",
      "markdown",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Read a file",
    summary:
      "Experimental: useMapoAiRead().read(file) posts one file to POST /_mapo/ai/read, which reads text, Markdown, JSON, HTML (its main content into Markdown, under its title and address, with its JSON-LD and Open Graph data in a second part) and CSV or XLSX (each sheet whole, as a Markdown table) into the text parts run takes, without calling any AI; pass answer.parts to useMapoAiFill().fill(). The answer's status says when there are none: unsupported, empty, too-long (more than limits.maxSourceChars) or failed; files up to limits.maxFileBytes, 10 MB by default. A web page by its address, as a link: useMapoAiRead().readLink(url), recipe ai-read-links.",
  },
  {
    id: "ai-read-links",
    task: "Give the AI a web page by its address, and keep the server's own network out of reach",
    keywords: [
      "url",
      "web page",
      "web address",
      "page address",
      "fetch a page",
      "ssrf",
      "private network",
      "mapo.ai.web",
      "registerMapoAiFetcher",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Read a web page",
    summary:
      "Experimental: useMapoAiRead().readLink(url) posts { url } to POST /_mapo/ai/read/link, which fetches the page from the app's server as a stranger would (no cookie, no Authorization) and reads it with the reader of its format, as read reads a file; Magic Fill's panel has a field for links where status.links is true. Links are on by default; the guard refuses non-http(s) addresses, credentials, ports other than 80 and 443, the hosts of mapo.ai.web.deny, and any host that leads to the server itself, a private network or a cloud's metadata, checked by the connection's own lookup and again at each redirect (five at most). mapo.ai.web: { allow (hosts opened, \"localhost:3000\" for development), deny (\"*\" keeps every host out), userAgent, timeout (20 s) }; limits.linksPerUserPerMinute (20) and limits.maxFileBytes bound the pages; mapo.ai.readers.link: false or NUXT_MAPO_AI_READERS_LINK=false turns links off. The answer: read (with url), off, blocked (reason), unreachable (reason), http-error (httpStatus), too-large, or read's own. registerMapoAiFetcher({ fetch }) in a Nitro plugin replaces Mapo's fetcher, which runs on Node, and its guard of the network.",
  },
  {
    id: "ai-readers",
    task: "Replace how the AI gateway reads a file format, add a format, or turn one off",
    keywords: [
      "registerMapoAiReader",
      "mapo-ai:read",
      "mapo.ai.readers",
      "custom reader",
      "reader",
      "file format",
      "turn off",
      "redact",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Replace or add a reader",
    summary:
      "Experimental: in a Nitro plugin, registerMapoAiReader({ id, extensions, types?, read(file) }) puts the app's reader in place of Mapo's with the same id (text, markdown, json, html, csv, xlsx) or adds a format; the id link is taken, by links. The mapo-ai:read hook touches up the parts any reader read (context.parts), of files and of pages read from links (context.file.url), never pasted text; mapo.ai.readers turns a reader off by id ({ xlsx: false }, or NUXT_MAPO_AI_READERS_XLSX=false), and links with link: false.",
  },
  {
    id: "ai-providers",
    task: "Add an AI provider, or answer with the mock",
    keywords: [
      "registerMapoAiProvider",
      "MapoAiProviderError",
      "registerMapoAiMockFixtures",
      "mapo.ai.providers",
      "mock provider",
      "fixtures",
      "llm",
    ],
    doc: "modules/ai.md",
    heading: "Providers",
    seeAlso: ["modules/api.md"],
    summary:
      "mapo.ai.providers enables what run may call: Mapo's mock, which answers without a network from fixtures or Label: value lines, Mapo's providers for OpenAI, Anthropic and local models, or a provider the app registers in a Nitro plugin with registerMapoAiProvider().",
  },
  {
    id: "ai-keys",
    task: "Assign AI provider keys and models to groups or users, or let operators use their own token",
    keywords: [
      "_mapo/ai/keys",
      "_mapo/ai/token",
      "assign a key",
      "key per group",
      "group",
      "personal token",
      "own token",
      "key level",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Keys",
    summary:
      "Experimental: each call uses the key nearest the user: their own token where an admin's assignment allows it (PUT /_mapo/ai/token), else the first key up the admins' assignments (the user's, their groups' by the admins' order, everyone's: PUT /_mapo/ai/keys, PUT /_mapo/ai/keys/groups), else the project's in the environment. The nearest assignment also narrows the models; personal tokens are off unless allowed; status says the level and the last four characters, never the key; a provider with no key at any level answers 503.",
  },
  {
    id: "ai-settings",
    task: "Give users and admins a page to choose AI providers and models, manage keys and check the connection",
    keywords: [
      "MapoAiSettings",
      "ai-settings",
      "mapo.ai.settings",
      "settings page",
      "usersApi",
      "groupsApi",
      "preference",
      "check the connection",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "AI settings",
    summary:
      "Experimental: the module adds an AI settings page at /ai-settings (mapo.ai.settings.path moves it, false leaves it out for <MapoAiSettings /> in a page of the app). Each user saves their provider and model (PUT /_mapo/ai/preferences), sees their key, saves their own token where allowed and checks the connection (POST /_mapo/ai/test, which lists the provider's models with their key, at no cost); admins assign keys, searching the backend's users and groups through mapo.ai.settings.usersApi and groupsApi.",
  },
  {
    id: "ai-admin-settings",
    task: "Let the AI's admins change its instructions, verification rules, secret fields and models without a deploy",
    keywords: [
      "secretWords",
      "adminModels",
      "fallbacks",
      "admin instructions",
      "verification rules",
      "secret field",
      "add a model",
      "how the AI works",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "How the AI works",
    summary:
      "Experimental: on the AI settings page the AI's admins change how the AI works in the whole app (GET/PUT /_mapo/ai/settings, POST /_mapo/ai/settings/preview): their instructions (layer 3 of the prompt, after Mapo's and the app's; every user of the AI reads them in Magic Fill's What I send to the AI), the rules of verification over mapo.ai.verification, words that keep a field from the AI besides Mapo's and mapo.ai.secretWords, the prompt cache of openai and anthropic, Anthropic's fallbacks (off; on only where the app's anthropic.fallbacks leaves them on), and models they add where the app sets providers.<id>.adminModels: true, saved once the provider's server lists them. The app's options stay the defaults; changes are audited, and an unreadable record closes the AI with 503.",
  },
  {
    id: "ai-usage",
    task: "See how much the AI is used and what it costs, by user, model and day",
    keywords: [
      "usage",
      "tokens",
      "cost",
      "prices",
      "mapo.ai.prices",
      "audit",
      "changes",
      "experimental",
    ],
    doc: "modules/ai.md",
    heading: "Usage",
    summary:
      "Experimental: the AI settings page shows the usage summed from the audit when it is read: the AI's admins see every user's calls of a period (GET /_mapo/ai/usage?days=, 1 to 3650, 30 unless set; the page offers 7, 30 and 90) by user, model and day, the latest 50 calls and the changes of keys and settings (GET /_mapo/ai/actions); each user their own (GET /_mapo/ai/usage/mine). Tokens always; a cost only for the models the app prices in mapo.ai.prices ({ currency, providers: { [provider]: { [model]: { input, output, cacheRead?, cacheWrite? } } } }, per million tokens): Mapo keeps no price list. Never what was sent.",
  },
  {
    id: "ai-cloud-models",
    task: "Use OpenAI or Anthropic (Claude) models for the AI",
    keywords: [
      "openai",
      "anthropic",
      "claude",
      "gpt",
      "api key",
      "prompt cache",
      "promptCache",
      "effort",
      "reasoning",
      "fallbacks",
      "structured outputs",
    ],
    doc: "modules/ai.md",
    heading: "OpenAI",
    summary:
      "Experimental: enable openai (Responses API, gpt-6.1-sol and gpt-6-luna unless models says otherwise) or anthropic (Messages API, claude-opus-5-5, claude-sonnet-5-5 and claude-haiku-5-5) in mapo.ai.providers, with the project's key in NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY or NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY, never in the config (the AI's admins can assign their own over it); effort is \"low\" unless set, promptCache is off unless set, timeout 300 seconds; Anthropic retries a request its safety filters decline on a fallback model, which the answer's provider.model names.",
  },
  {
    id: "ai-local-models",
    task: "Use a local model, served by Ollama, LM Studio or vLLM, for the AI",
    keywords: [
      "ollama",
      "local model",
      "openai-compatible",
      "lm studio",
      "vllm",
      "llama.cpp",
      "self-hosted",
      "server",
      "api key",
      "baseURL",
      "contextTokens",
      "num_ctx",
    ],
    doc: "modules/ai.md",
    heading: "Ollama",
    summary:
      "Experimental: enable ollama (Ollama 0.40.13 or later, through its own API, http://localhost:11434 unless baseURL says otherwise) or openai-compatible (baseURL up to /v1, contextTokens when the server's list does not say the context) in mapo.ai.providers, with the models to allow; keys go in NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY or NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY; a prompt the model cannot read whole answers 413, a cut answer 502.",
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

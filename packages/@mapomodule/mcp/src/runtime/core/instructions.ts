/**
 * Server instructions: what a client receives on `initialize`, and what most
 * clients put in front of the model before any tool call. The Nuxt handler and
 * the stdio CLI both use this text, so the two transports describe Mapo the
 * same way. It stays short; the long form is the overview page (`overview.ts`).
 *
 * Every `mapo_*` name below must be a real tool: a test checks it.
 */
export const MAPO_INSTRUCTIONS = `Mapo v2 is a Nuxt 4 admin framework (Vue 3, Nuxt UI v4, Pinia, @nuxtjs/i18n) for building backoffices on a REST API that follows Django REST Framework conventions. An app registers "@nuxt/ui" and then "mapomodule", and configures everything under the \`mapo\` key. The packages: @mapomodule/core ($mapoFetch, useCrud, useMapoAuth, the auth/permissions/roles middleware), store (Pinia stores), uikit (layouts, sidebar, MapoList, MapoDetail, media and menu managers, theming, MapoOverride), form (FieldDescriptor arrays rendered through a field registry, useMapoForm), i18n and utils. A page is declarative: definePageMeta (layout, middleware, label, icon, permissions) plus one Mapo component with props; the sidebar is built from route metadata. Mapo v2 is a rewrite of v1 (Nuxt 2, Vuex, Axios): v1 APIs do not exist here.

Workflow:
1. New to the project or the task? Read the overview: the mapo://overview resource, or mapo_get_doc({ path: "guide/concepts.md" }).
2. Call mapo_inspect_app before writing code for this project: it reports the Mapo modules installed, the field types actually registered, the components available and the real configuration. mapo_doctor explains anything that looks misconfigured. Both need the app's dev server.
3. Start from mapo_list_recipes to find the canonical approach: Mapo ships a lot out of the box, and each recipe names the page that documents it.
4. Use mapo_search_docs for anything the recipes do not cover, then mapo_get_doc to read the exact section. Prefer these over recalling Mapo APIs from memory.
5. Never invent component props, slots or field types: look them up with mapo_component_api, mapo_list_field_types and mapo_composable_api, which read the installed source.
6. mapo_backend_schema maps the backend's OpenAPI schema to field descriptors, and mapo_scaffold generates pages, fields and overrides in Mapo's own patterns (a dry run unless asked to write).
7. Cite the doc path you relied on when you produce code.`;

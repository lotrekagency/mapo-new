import { defineMcpHandler } from "@nuxtjs/mcp-toolkit/server";

/**
 * Named handler → route `<mcp.route>/mapo` (default `/mcp/mapo`).
 *
 * Tools, resources and prompts are auto-attributed from the sibling folders,
 * so they never leak into the consuming app's own `/mcp` endpoint
 * (`defaultHandlerStrategy` defaults to `'orphans'`).
 */
export default defineMcpHandler({
  name: "mapo",
  description:
    "Mapo admin framework: docs, component and field APIs, app introspection, scaffolding.",
  instructions: `This server exposes the Mapo admin framework (Nuxt 4 + Nuxt UI) to coding agents.

Workflow:
1. Call mapo_inspect_app before writing code for this project: it reports the mapo modules installed, the field types actually registered, the components available and the real configuration. mapo_doctor explains anything that looks misconfigured.
2. Start from mapo_list_recipes to find the canonical approach for the task — Mapo ships a lot out of the box, and the recipe names the page that documents it.
3. Use mapo_search_docs for anything the recipes do not cover, then mapo_get_doc to read the exact section. Prefer these over recalling Mapo APIs from memory: Mapo v2 differs substantially from v1.
4. Never invent component props, slots or field types: look them up with mapo_component_api, mapo_list_field_types and mapo_composable_api, which read the installed source.
5. Cite the doc path you relied on when you produce code.`,
});

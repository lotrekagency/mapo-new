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
1. Start from mapo_list_recipes to find the canonical approach for the task — Mapo ships a lot out of the box, and the recipe names the page that documents it.
2. Use mapo_search_docs for anything the recipes do not cover, then mapo_get_doc to read the exact section. Prefer these over recalling Mapo APIs from memory: Mapo v2 differs substantially from v1.
3. Never invent component props, slots or field types: look them up. Ask mapo_search_docs with the symbol name (e.g. "MapoDetail props") to get the reference tables.
4. Cite the doc path you relied on when you produce code.`,
});

import { defineMcpHandler } from "@nuxtjs/mcp-toolkit/server";
import { MAPO_INSTRUCTIONS } from "../../../core/instructions.js";

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
  instructions: MAPO_INSTRUCTIONS,
});

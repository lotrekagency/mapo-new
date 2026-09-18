/** Adapter: shared prompt spec → `@nuxtjs/mcp-toolkit` definition. */
import { defineMcpPrompt } from "@nuxtjs/mcp-toolkit/server";
import type { MapoPrompt } from "../core/prompts.js";

// Lives outside `runtime/mcp/` for the same reason as `to-mcp-tool.ts`: every
// top-level file of a scanned path is loaded as a handler definition.
export function toMcpPrompt(
  prompt: MapoPrompt<Record<string, string | undefined>>,
) {
  return defineMcpPrompt({
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    inputSchema: prompt.argsSchema,
    // The toolkit types the callback from the zod shape, which widens to
    // `unknown` for a generic `ZodRawShape`; every argument here is an optional
    // string, validated by zod before the handler runs.
    handler: (args: Record<string, unknown>) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: prompt.render(args as Record<string, string | undefined>),
          },
        },
      ],
    }),
  });
}

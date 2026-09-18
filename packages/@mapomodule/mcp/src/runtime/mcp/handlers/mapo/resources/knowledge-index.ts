import { defineMcpResource } from "@nuxtjs/mcp-toolkit/server";
import { INDEX_URI, renderKnowledgeIndex } from "../../../../core/resources.js";
import {
  useApiKnowledge,
  useDocsKnowledge,
} from "../../../../nitro/context.js";

export default defineMcpResource({
  name: "mapo-knowledge-index",
  title: "Mapo knowledge index",
  description:
    "Everything the Mapo MCP server knows: recipes, documentation pages, components, field types and composables.",
  uri: INDEX_URI,
  metadata: { mimeType: "text/markdown" },
  handler: (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: "text/markdown",
        text: renderKnowledgeIndex(useDocsKnowledge(), useApiKnowledge()),
      },
    ],
  }),
});

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineMcpResource } from "@nuxtjs/mcp-toolkit/server";
import {
  DOCS_URI_PREFIX,
  docResourceList,
  renderDocResource,
} from "../../../../core/resources.js";
import { useDocsKnowledge } from "../../../../nitro/context.js";

/**
 * `{+path}` (reserved expansion) is required: doc paths contain slashes, which
 * a plain `{path}` variable would not match.
 */
export default defineMcpResource({
  name: "mapo-doc",
  title: "Mapo documentation page",
  description:
    "A full Mapo documentation page, addressed by its path (e.g. howto/crud-list.md).",
  uri: new ResourceTemplate(`${DOCS_URI_PREFIX}{+path}`, {
    list: () => ({ resources: docResourceList(useDocsKnowledge()) }),
  }),
  metadata: { mimeType: "text/markdown" },
  handler: (uri: URL, variables: Record<string, string | string[]>) => {
    const raw = variables.path;
    const path = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
    const text = renderDocResource(
      useDocsKnowledge(),
      decodeURIComponent(path),
    );

    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: text ?? `No documentation page at "${path}".`,
        },
      ],
    };
  },
});

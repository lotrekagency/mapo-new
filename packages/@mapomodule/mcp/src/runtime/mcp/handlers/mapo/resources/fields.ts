import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineMcpResource } from "@nuxtjs/mcp-toolkit/server";
import {
  FIELD_URI_PREFIX,
  fieldResourceList,
  renderFieldResource,
} from "../../../../core/resources.js";
import { useApiKnowledge } from "../../../../nitro/context.js";

export default defineMcpResource({
  name: "mapo-field-type",
  title: "Mapo form field type",
  description:
    "The full contract of a form field type: the component behind it, its attrs and the shared descriptor properties.",
  uri: new ResourceTemplate(`${FIELD_URI_PREFIX}{type}`, {
    list: () => ({ resources: fieldResourceList(useApiKnowledge()) }),
  }),
  metadata: { mimeType: "text/markdown" },
  handler: (uri: URL, variables: Record<string, string | string[]>) => {
    const raw = variables.type;
    const type = Array.isArray(raw) ? raw[0]! : (raw ?? "");
    const text = renderFieldResource(
      useApiKnowledge(),
      decodeURIComponent(type),
    );

    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: text ?? `No field type "${type}" is registered.`,
        },
      ],
    };
  },
});

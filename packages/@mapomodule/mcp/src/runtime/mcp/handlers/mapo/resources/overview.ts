import { defineMcpResource } from "@nuxtjs/mcp-toolkit/server";
import { renderOverview } from "../../../../core/overview.js";
import { OVERVIEW_URI } from "../../../../core/resources.js";
import { useDocsKnowledge } from "../../../../nitro/context.js";

export default defineMcpResource({
  name: "mapo-overview",
  title: "Mapo overview",
  description:
    "How Mapo fits together: the packages, the backend contract, declarative pages, the form engine and the customization layers.",
  uri: OVERVIEW_URI,
  metadata: { mimeType: "text/markdown" },
  handler: (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: "text/markdown",
        text: renderOverview(useDocsKnowledge()),
      },
    ],
  }),
});

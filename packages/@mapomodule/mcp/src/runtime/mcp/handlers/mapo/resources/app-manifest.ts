import { defineMcpResource } from "@nuxtjs/mcp-toolkit/server";
import { MANIFEST_URI } from "../../../../core/resources.js";
import { useMapoManifest } from "../../../../nitro/context.js";

/**
 * The only resource that depends on the running app: a build-time snapshot of
 * the consuming project (installed mapo modules, public config, registered
 * field types, Mapo components, admin routes, locales).
 *
 * Not available from the stdio CLI, which knows nothing about the app.
 */
export default defineMcpResource({
  name: "mapo-app-manifest",
  title: "This app's Mapo setup",
  description:
    "Installed Mapo modules, public Mapo config, registered field types, available components, admin routes and locales of the app currently running.",
  uri: MANIFEST_URI,
  metadata: { mimeType: "application/json" },
  handler: (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(useMapoManifest(), null, 2),
      },
    ],
  }),
});

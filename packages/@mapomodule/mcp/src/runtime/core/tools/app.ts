/**
 * Live tools: they describe the app the server runs inside.
 *
 * Only the Nuxt module can answer these — the stdio CLI knows Mapo but not the
 * project using it — so when the manifest is absent they explain how to get it
 * instead of failing or, worse, guessing.
 */
import { z } from "zod";
import { DOCTOR_BLIND_SPOTS, runDoctor } from "../doctor.js";
import { defineMapoTool } from "../tool-spec.js";
import type { AnyMapoToolSpec, MapoToolContext } from "../tool-spec.js";
import type { MapoAppManifest } from "../../../index.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const NO_APP =
  "This tool needs the running app and is only served over HTTP.\n\n" +
  "Start the dev server (`pnpm dev`) and point the client at " +
  "`http://localhost:3000/mcp/mapo`. The stdio server (`mapo-mcp serve`) knows the framework " +
  "and its documentation, but not the project using it.";

type InspectSection =
  | "modules"
  | "config"
  | "fields"
  | "components"
  | "routes"
  | "locales";

interface InspectArgs {
  include?: InspectSection[];
}

function renderModules(manifest: MapoAppManifest): string {
  const installed = manifest.modules
    .map(
      (module) =>
        `- \`${module.name}\`${module.version ? ` @ ${module.version}` : ""}`,
    )
    .join("\n");

  return (
    `## Installed Mapo modules\n${installed || "- (none)"}\n\n` +
    `Declaration order in nuxt.config: ${manifest.moduleOrder.map((name) => `\`${name}\``).join(" → ") || "(none)"}\n`
  );
}

function renderConfig(manifest: MapoAppManifest): string {
  const entries = Object.entries(manifest.config);
  if (!entries.length) return "## Configuration\n(no public Mapo config)\n";

  const blocks = entries.map(
    ([key, value]) =>
      `### ${key}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``,
  );
  return `## Configuration (public runtime config)\n${blocks.join("\n")}\n`;
}

function renderFields(manifest: MapoAppManifest): string {
  const registry = manifest.fieldTypes.filter(
    (field) => field.source === "default",
  );
  const custom = manifest.fieldTypes.filter(
    (field) => field.source === "config",
  );

  return (
    `## Registered field types (${manifest.fieldTypes.length})\n` +
    `- from the registry: ${registry.map((field) => `\`${field.type}\``).join(", ") || "(none)"}\n` +
    (custom.length
      ? `- added in nuxt.config: ${custom.map((field) => `\`${field.type}\``).join(", ")}\n`
      : "") +
    "- types registered at runtime with `defineFormField()` are not visible here\n"
  );
}

function renderComponents(manifest: MapoAppManifest): string {
  return (
    `## Available Mapo components (${manifest.components.length})\n` +
    `${manifest.components.map((name) => `\`${name}\``).join(", ") || "(none)"}\n\n` +
    "Ask mapo_component_api for the props of any of them.\n"
  );
}

function renderRoutes(manifest: MapoAppManifest): string {
  const lines = manifest.routes.map((route) => `- \`${route.path}\``);
  return `## Routes (${manifest.routes.length})\n${lines.join("\n") || "- (none)"}\n`;
}

export const inspectAppTool = defineMapoTool({
  name: "mapo_inspect_app",
  title: "Inspect this Mapo app",
  description:
    "Report how Mapo is actually set up in the project currently running: installed modules and " +
    "versions, public Mapo configuration, registered form field types, available Mapo components, " +
    "routes and locales. Call this before writing code for the project, so the code matches its " +
    "real configuration instead of the defaults.",
  inputSchema: {
    include: z
      .array(
        z.enum([
          "modules",
          "config",
          "fields",
          "components",
          "routes",
          "locales",
        ]),
      )
      .optional()
      .describe("Limit the report to these sections"),
  },
  annotations: READ_ONLY,
  inputExamples: [{}, { include: ["fields", "config"] }],
  run: (args: InspectArgs, context: MapoToolContext) => {
    const manifest = context.manifest();
    if (!manifest) return NO_APP;

    const wanted = args.include?.length ? new Set(args.include) : null;
    const want = (section: InspectSection) => !wanted || wanted.has(section);
    const parts: string[] = [];

    if (want("modules")) parts.push(renderModules(manifest));
    if (want("config")) parts.push(renderConfig(manifest));
    if (want("fields")) parts.push(renderFields(manifest));
    if (want("components")) parts.push(renderComponents(manifest));
    if (want("routes")) parts.push(renderRoutes(manifest));
    if (want("locales")) {
      parts.push(
        `## Locales\n${manifest.locales.join(", ") || "(i18n not configured)"}\n`,
      );
    }

    return (
      `# Mapo setup of \`${manifest.rootDir}\`\n\n${parts.join("\n")}\n` +
      `Snapshot taken when the dev server started; restart it after changing nuxt.config.`
    );
  },
});

export const doctorTool = defineMapoTool({
  name: "mapo_doctor",
  title: "Diagnose this Mapo app",
  description:
    "Check the running project for known Mapo misconfigurations — module ordering, missing login " +
    "route, untouched auth endpoints, locales without catalogs, media endpoints — and return each " +
    "problem with the exact fix. Run it when something behaves unexpectedly, or before shipping.",
  inputSchema: {
    severity: z
      .enum(["error", "warning", "info"])
      .optional()
      .describe("Only report findings at this severity or above"),
  },
  annotations: READ_ONLY,
  inputExamples: [{}, { severity: "error" }],
  run: (
    args: { severity?: "error" | "warning" | "info" },
    context: MapoToolContext,
  ) => {
    const manifest = context.manifest();
    if (!manifest) return NO_APP;

    const threshold = { error: 0, warning: 1, info: 2 };
    const minimum = threshold[args.severity ?? "info"];
    const findings = runDoctor(manifest).filter(
      (finding) => threshold[finding.severity] <= minimum,
    );

    const blindSpots = `\n_Not checked: ${DOCTOR_BLIND_SPOTS.join("; ")}._`;

    if (!findings.length) {
      return `No problem found in \`${manifest.rootDir}\`.\n${blindSpots}`;
    }

    const icons = { error: "✖", warning: "▲", info: "ℹ" } as const;
    const blocks = findings.map(
      (finding) =>
        `### ${icons[finding.severity]} ${finding.rule} (${finding.severity})\n` +
        `${finding.message}\n` +
        (finding.fix ? `\n**Fix**: ${finding.fix}\n` : "") +
        (finding.doc ? `Docs: \`${finding.doc}\`\n` : ""),
    );

    const errors = findings.filter(
      (finding) => finding.severity === "error",
    ).length;
    return (
      `${findings.length} finding(s)${errors ? `, ${errors} of which block the app` : ""}:\n\n` +
      `${blocks.join("\n")}${blindSpots}`
    );
  },
});

/** Tools that require the running app. */
export const appTools: AnyMapoToolSpec[] = [inspectAppTool, doctorTool];

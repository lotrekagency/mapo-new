/**
 * The only tool that can change the project.
 *
 * It generates code from templates modelled on the canonical recipes, and by
 * default only *shows* it: `write` is an explicit opt-in, guarded by
 * `../write.ts`. Generation and writing stay separate so an agent can propose
 * before it touches anything.
 */
import { z } from "zod";
import {
  SCAFFOLD_DESCRIPTIONS,
  SCAFFOLD_KINDS,
  UnknownFieldTypeError,
  scaffold,
} from "../scaffold/index.js";
import { defineMapoTool } from "../tool-spec.js";
import { writeScaffold } from "../write.js";
import type { ScaffoldKind } from "../scaffold/index.js";
import type { AnyMapoToolSpec, MapoToolContext } from "../tool-spec.js";

interface ScaffoldArgs {
  kind: ScaffoldKind;
  name?: string;
  endpoint?: string;
  route?: string;
  fields?: string[];
  write?: boolean;
  overwrite?: boolean;
}

/** Fence language, so the client renders the file with the right highlighting. */
function languageOf(path: string): string {
  if (path.endsWith(".vue")) return "vue";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".css")) return "css";
  return "";
}

const KIND_LIST = SCAFFOLD_KINDS.map(
  (kind) => `\`${kind}\` (${SCAFFOLD_DESCRIPTIONS[kind]})`,
).join(", ");

export const scaffoldTool = defineMapoTool({
  name: "mapo_scaffold",
  title: "Scaffold Mapo code",
  description:
    "Generate Mapo code that follows the framework's canonical patterns: list and detail pages, " +
    "standalone forms, custom field types, login page, theming, backend proxy, menu and media " +
    "pages. Returns the files for review; pass `write: true` to create them in the project. " +
    `Kinds: ${KIND_LIST}.`,
  inputSchema: {
    kind: z.enum(SCAFFOLD_KINDS).describe("What to generate"),
    name: z
      .string()
      .optional()
      .describe(
        "Resource name, e.g. 'articles' — or the type name for custom-field",
      ),
    endpoint: z
      .string()
      .optional()
      .describe("REST endpoint (default `/api/<name>`)"),
    route: z.string().optional().describe("Route base (default `/<name>`)"),
    fields: z
      .array(z.string())
      .optional()
      .describe(
        "Field specs `key[:type[:label]]`, e.g. ['title:text:Title', 'body:editor']",
      ),
    write: z
      .boolean()
      .optional()
      .describe(
        "Create the files instead of only showing them (development only)",
      ),
    overwrite: z
      .boolean()
      .optional()
      .describe("Allow replacing files that already exist"),
  },
  annotations: {
    // Not read-only: with `write` it creates files. Never destructive: existing
    // files are refused unless `overwrite` is set.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    {
      kind: "list-page",
      name: "articles",
      fields: ["title:text:Title", "status:select:Status"],
    },
    {
      kind: "detail-page",
      name: "articles",
      fields: ["title:text", "body:editor"],
      write: true,
    },
    { kind: "custom-field", name: "star-rating" },
  ],
  run: (args: ScaffoldArgs, context: MapoToolContext) => {
    let result;
    try {
      // The registry is the source of truth for field types: reject anything
      // that would not render, instead of generating a broken descriptor.
      result = scaffold({
        kind: args.kind,
        ...(args.name ? { name: args.name } : {}),
        ...(args.endpoint ? { endpoint: args.endpoint } : {}),
        ...(args.route ? { route: args.route } : {}),
        ...(args.fields ? { fields: args.fields } : {}),
        api: context.api(),
      });
    } catch (error) {
      if (error instanceof UnknownFieldTypeError) return error.message;
      throw error;
    }

    const notes = result.notes.map((note) => `- ${note}`).join("\n");
    const docs = result.docs.map((doc) => `\`${doc}\``).join(", ");

    if (!args.write) {
      const blocks = result.files
        .map(
          (file) =>
            `### \`${file.path}\`\n\n\`\`\`${languageOf(file.path)}\n${file.content}\`\`\``,
        )
        .join("\n\n");

      return (
        `# ${SCAFFOLD_DESCRIPTIONS[args.kind]}\n\n${blocks}\n\n` +
        `## Notes\n${notes}\n\nDocs: ${docs}\n\n` +
        `Nothing was written. Call again with \`write: true\` to create these files.`
      );
    }

    const root = context.rootDir();
    if (!root) {
      return (
        "Cannot write: the project root is unknown.\n\n" +
        "Connect to the app's endpoint (`/mcp/mapo`) so the server knows where the project is, " +
        "or run `mapo-mcp serve --root <path>`. The files above are unchanged."
      );
    }

    const outcomes = writeScaffold(result.files, {
      root,
      overwrite: args.overwrite ?? false,
      allowed: context.canWrite(),
    });

    const lines = outcomes.map((outcome) => {
      const icon = outcome.status === "written" ? "✔" : "✖";
      const detail = outcome.reason ? ` — ${outcome.reason}` : "";
      return `- ${icon} \`${outcome.path}\` (${outcome.status})${detail}`;
    });

    const written = outcomes.filter(
      (outcome) => outcome.status === "written",
    ).length;
    const blocked = outcomes.length - written;

    return (
      `# ${SCAFFOLD_DESCRIPTIONS[args.kind]}\n\n` +
      `Root: \`${root}\`\n\n${lines.join("\n")}\n\n` +
      (blocked
        ? `${blocked} file(s) were not written. Read the reason above; use \`overwrite: true\` only when replacing is intended.\n\n`
        : "") +
      `## Notes\n${notes}\n\nDocs: ${docs}`
    );
  },
});

export const scaffoldTools: AnyMapoToolSpec[] = [scaffoldTool];

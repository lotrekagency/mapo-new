/**
 * Backend schema tool: turns the API the app talks to into Mapo descriptors.
 *
 * This is the last gap between "knows Mapo" and "knows this project": the
 * assistant can now read the real serializers instead of guessing which fields
 * a model has and which types they should use.
 */
import { z } from "zod";
import {
  listModels,
  renderFields,
  resolveSchema,
  toFields,
  toScaffoldSpecs,
} from "../openapi.js";
import {
  SchemaUnavailableError,
  loadOpenApiDocument,
} from "../schema-source.js";
import { defineMapoTool } from "../tool-spec.js";
import type { AnyMapoToolSpec, MapoToolContext } from "../tool-spec.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  // It reaches a backend that is not part of this server.
  openWorldHint: true,
} as const;

type Action = "list_models" | "describe_model" | "to_fields";

interface BackendArgs {
  action: Action;
  model?: string;
  url?: string;
  includeReadOnly?: boolean;
}

const NO_SOURCE =
  "No schema source configured.\n\n" +
  "Set `mapo.mcp.backend.schemaUrl` in nuxt.config (drf-spectacular: " +
  "`http://localhost:8000/api/schema/?format=json`), export `MAPO_BACKEND_SCHEMA_URL`, " +
  "or pass `url` to this tool. A local path to an exported schema works too.";

export const backendSchemaTool = defineMapoTool({
  name: "mapo_backend_schema",
  title: "Backend schema → Mapo fields",
  description:
    "Read the backend's OpenAPI/DRF schema and turn a serializer into Mapo field descriptors: " +
    "types, choices, required and read-only flags, and the endpoint of every relation. " +
    "Use it before writing a form against a real API, and feed its output to mapo_scaffold.",
  inputSchema: {
    action: z
      .enum(["list_models", "describe_model", "to_fields"])
      .describe(
        "list the serializers, inspect one, or map one to field descriptors",
      ),
    model: z.string().optional().describe("Component name, e.g. 'Article'"),
    url: z
      .string()
      .optional()
      .describe(
        "Schema URL or local file path; defaults to the configured source",
      ),
    includeReadOnly: z
      .boolean()
      .optional()
      .describe(
        "Keep server-computed properties (id, timestamps) as readonly fields",
      ),
  },
  annotations: READ_ONLY,
  inputExamples: [
    { action: "list_models" },
    { action: "to_fields", model: "Article" },
  ],
  run: async (args: BackendArgs, context: MapoToolContext) => {
    const backend = context.backend();
    const source = args.url ?? backend.schemaUrl;
    if (!source) return NO_SOURCE;

    let document;
    try {
      document = await loadOpenApiDocument(source, {
        token: backend.token,
        rootDir: context.rootDir(),
      });
    } catch (error) {
      if (error instanceof SchemaUnavailableError) return error.message;
      throw error;
    }

    const title = document.info?.title ? `${document.info.title} — ` : "";

    if (args.action === "list_models") {
      const models = listModels(document);
      if (!models.length) return `${source} declares no component schemas.`;

      const lines = models.map(
        (model) =>
          `- \`${model.name}\` (${model.fieldCount} properties)` +
          (model.endpoint
            ? ` → \`${model.endpoint}\``
            : " — no list endpoint declared"),
      );

      return (
        `# ${title}${models.length} models\nsource: \`${source}\`\n\n${lines.join("\n")}\n\n` +
        'Call this tool again with `action: "to_fields"` and a model name.'
      );
    }

    if (!args.model) {
      return `\`${args.action}\` needs a \`model\`. Run \`action: "list_models"\` to see what exists.`;
    }

    const schema = document.components?.schemas?.[args.model];
    if (!schema) {
      const available = listModels(document)
        .map((model) => model.name)
        .slice(0, 30)
        .join(", ");
      return `No model \`${args.model}\` in ${source}. Available: ${available}.`;
    }

    if (args.action === "describe_model") {
      const required = new Set(schema.required ?? []);
      const rows = Object.entries(schema.properties ?? {}).map(
        ([key, property]) => {
          const { schema: resolved, ref } = resolveSchema(document, property);
          const kind = ref ?? resolved.type ?? "unknown";
          const flags = [
            required.has(key) ? "required" : "",
            resolved.readOnly ? "read-only" : "",
            resolved.nullable ? "nullable" : "",
            resolved.enum?.length ? `enum(${resolved.enum.length})` : "",
          ]
            .filter(Boolean)
            .join(", ");
          return `- \`${key}\`: ${kind}${resolved.format ? ` (${resolved.format})` : ""}${flags ? ` — ${flags}` : ""}`;
        },
      );

      return (
        `# ${args.model}\nsource: \`${source}\`\n` +
        (schema.description ? `\n${schema.description}\n` : "") +
        `\n${rows.join("\n") || "(no properties)"}\n\n` +
        `Map it with \`action: "to_fields"\`.`
      );
    }

    // to_fields
    const knownTypes = new Set(
      context.api().fieldTypes.map((field) => field.type),
    );
    const result = toFields(document, args.model, {
      knownTypes,
      ...(args.includeReadOnly ? { includeReadOnly: true } : {}),
    })!;

    const skipped = result.skipped.length
      ? `\n## Skipped\n${result.skipped.map((entry) => `- \`${entry.key}\` — ${entry.reason}`).join("\n")}\n`
      : "";

    const notes = result.notes.length
      ? `\n${result.notes.map((note) => `- ${note}`).join("\n")}\n`
      : "";

    const specs = toScaffoldSpecs(result);
    const scaffoldLine = specs.length
      ? `\n## Scaffold it\n\`\`\`json\n${JSON.stringify(
          {
            kind: "detail-page",
            name: args.model.toLowerCase(),
            ...(result.endpoint ? { endpoint: result.endpoint } : {}),
            fields: specs,
          },
          null,
          2,
        )}\n\`\`\`\nPass that to mapo_scaffold.\n`
      : "";

    return (
      `# ${args.model} → ${result.fields.length} field descriptors\n` +
      `source: \`${source}\`${result.endpoint ? ` · endpoint: \`${result.endpoint}\`` : ""}\n\n` +
      `\`\`\`ts\n${renderFields(result)}\n\`\`\`\n` +
      skipped +
      notes +
      scaffoldLine +
      "\nTypes were checked against the registry of this app: a property whose mapping is not " +
      "registered is skipped rather than emitted."
    );
  },
});

export const backendTools: AnyMapoToolSpec[] = [backendSchemaTool];

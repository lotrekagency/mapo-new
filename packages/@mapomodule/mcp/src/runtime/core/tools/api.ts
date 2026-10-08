/**
 * API-surface tools: components, form field types and composables, all read
 * from source at build time rather than from prose.
 *
 * These answer the questions models get wrong most often — which props a
 * component takes, which `attrs` a field type accepts, what a composable
 * returns — so the output is deliberately dense and quotes real types.
 */
import { z } from "zod";
import { defineMapoTool } from "../tool-spec.js";
import type { AnyMapoToolSpec, MapoToolContext } from "../tool-spec.js";
import type {
  ApiMember,
  ComponentApi,
  ComposableApi,
  FieldTypeApi,
} from "../types.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function renderMembers(title: string, members: ApiMember[]): string {
  if (!members.length) return `**${title}**: none\n`;

  const lines = members.map((member) => {
    const type = member.type ? `: \`${member.type}\`` : "";
    const required = member.required ? " **required**" : "";
    const fallback =
      member.default !== undefined ? ` (default \`${member.default}\`)` : "";
    const description = member.description ? ` — ${member.description}` : "";
    return `- \`${member.name}\`${type}${required}${fallback}${description}`;
  });

  return `**${title}** (${members.length})\n${lines.join("\n")}\n`;
}

function renderDocs(docs: string[]): string {
  return docs.length
    ? `\nDocs: ${docs.map((doc) => `\`${doc}\``).join(", ")}\n`
    : "";
}

/** Exact match first, then substring, so `list` finds `MapoList`. */
function findByName<T extends { name: string }>(
  entries: T[],
  name: string,
): T | undefined {
  const needle = name.toLowerCase();
  return (
    entries.find((entry) => entry.name.toLowerCase() === needle) ??
    entries.find((entry) => entry.name.toLowerCase() === `mapo${needle}`) ??
    entries.find((entry) => entry.name.toLowerCase().includes(needle))
  );
}

function suggest<T extends { name: string }>(
  entries: T[],
  name: string,
  limit = 8,
): string {
  const needle = name.toLowerCase();
  const close = entries
    .filter((entry) => {
      const candidate = entry.name.toLowerCase();
      return (
        [...needle].some((char) => candidate.includes(char)) &&
        candidate.length > 0
      );
    })
    .slice(0, limit)
    .map((entry) => entry.name);

  return close.length ? `\n\nAvailable: ${close.join(", ")}` : "";
}

interface ComponentApiArgs {
  name: string;
  include?: Array<"props" | "events" | "slots" | "exposed">;
}

function renderComponent(
  component: ComponentApi,
  include?: ComponentApiArgs["include"],
): string {
  const wanted = include?.length ? new Set(include) : null;
  const sections: string[] = [];

  if (!wanted || wanted.has("props"))
    sections.push(renderMembers("Props", component.props));
  if (!wanted || wanted.has("events"))
    sections.push(renderMembers("Events", component.events));
  if (!wanted || wanted.has("slots"))
    sections.push(renderMembers("Slots", component.slots));
  if ((!wanted || wanted.has("exposed")) && component.exposed.length) {
    sections.push(renderMembers("Exposed", component.exposed));
  }

  return (
    `# ${component.name}\n` +
    `package: \`${component.pkg}\` · source: \`${component.file}\`\n` +
    (component.description ? `\n${component.description}\n` : "") +
    `\n${sections.join("\n")}` +
    renderDocs(component.docs)
  );
}

export const componentApiTool = defineMapoTool({
  name: "mapo_component_api",
  title: "Mapo component API",
  description:
    "Props, events, slots and exposed methods of a Mapo component, extracted from its source " +
    "(not from the docs, which can lag behind). Call this before using any Mapo* component; " +
    "omit `name` filters to see what exists.",
  inputSchema: {
    name: z
      .string()
      .describe(
        "Component name, e.g. 'MapoList'. Partial names work ('list', 'detail').",
      ),
    include: z
      .array(z.enum(["props", "events", "slots", "exposed"]))
      .optional()
      .describe("Limit the response to these sections"),
  },
  annotations: READ_ONLY,
  inputExamples: [
    { name: "MapoList" },
    { name: "MapoDetail", include: ["slots"] },
  ],
  run: (args: ComponentApiArgs, context: MapoToolContext) => {
    const { components } = context.api();
    const component = findByName(components, args.name);

    if (!component) {
      return (
        `No Mapo component matches "${args.name}".` +
        suggest(components, args.name) +
        `\n\n${components.length} components are available; ask for one by name.`
      );
    }

    return renderComponent(component, args.include);
  },
});

interface FieldTypesArgs {
  type?: string;
}

/** Minimal descriptor skeleton, listing only what the type actually requires. */
function exampleDescriptor(field: FieldTypeApi): string {
  const requiredAttrs = field.attrs.filter((attr) => attr.required);
  const attrs = requiredAttrs.length
    ? `, attrs: { ${requiredAttrs.map((attr) => `${attr.name}: …`).join(", ")} }`
    : "";
  return `{ key: "…", type: "${field.type}", label: "…"${attrs} }`;
}

function renderFieldType(field: FieldTypeApi, common: ApiMember[]): string {
  const defaults = field.defaultAttrs
    ? `registry defaults: \`${JSON.stringify(field.defaultAttrs)}\`\n`
    : "";

  return (
    `# Field type \`${field.type}\`\n` +
    (field.component
      ? `component: \`${field.component}\``
      : "component: (unmapped)") +
    (field.descriptor ? ` · descriptor: \`${field.descriptor}\`` : "") +
    (field.hasAccessor ? " · has a default get/set accessor" : "") +
    "\n" +
    defaults +
    (field.description ? `\n${field.description}\n` : "") +
    `\n\`\`\`ts\n${exampleDescriptor(field)}\n\`\`\`\n\n` +
    renderMembers("attrs", field.attrs) +
    `\nEvery descriptor also accepts: ${common.map((member) => `\`${member.name}\``).join(", ")}. ` +
    `Call mapo_list_field_types with no argument for the full list of types.` +
    renderDocs(field.docs)
  );
}

export const fieldTypesTool = defineMapoTool({
  name: "mapo_list_field_types",
  title: "Mapo form field types",
  description:
    "The form field registry: every `type` a FieldDescriptor accepts, the component behind it, " +
    "and the exact `attrs` it takes — read from source. Use this before writing any field " +
    "descriptor; never invent a field type or an attr.",
  inputSchema: {
    type: z
      .string()
      .optional()
      .describe(
        "Field type to detail, e.g. 'select'. Omit to list every type.",
      ),
  },
  annotations: READ_ONLY,
  inputExamples: [{}, { type: "repeater" }],
  run: (args: FieldTypesArgs, context: MapoToolContext) => {
    const { fieldTypes, fieldCommon } = context.api();

    if (args.type) {
      const needle = args.type.toLowerCase();
      const field = fieldTypes.find(
        (entry) => entry.type.toLowerCase() === needle,
      );
      if (!field) {
        return (
          `No field type "${args.type}". Available: ` +
          `${fieldTypes.map((entry) => entry.type).join(", ")}.\n\n` +
          `Custom types are registered with defineFormField() — see uikit/form/registry.md.`
        );
      }
      return renderFieldType(field, fieldCommon);
    }

    const lines = fieldTypes.map((field) => {
      const attrs = field.attrs.length
        ? ` — attrs: ${field.attrs.map((attr) => attr.name).join(", ")}`
        : "";
      return `- \`${field.type}\`${field.component ? ` → ${field.component}` : ""}${attrs}`;
    });

    return (
      `${fieldTypes.length} registered field types:\n\n${lines.join("\n")}\n\n` +
      `Shared descriptor properties: ${fieldCommon.map((member) => `\`${member.name}\``).join(", ")}.\n` +
      `Call mapo_list_field_types({ type }) for the full contract of one type.`
    );
  },
});

interface ComposableArgs {
  name?: string;
}

function renderComposable(composable: ComposableApi): string {
  return (
    `# ${composable.name}\n` +
    `package: \`${composable.pkg}\` · source: \`${composable.file}\` · auto-imported\n` +
    (composable.description ? `\n${composable.description}\n` : "") +
    (composable.signature
      ? `\n\`\`\`ts\n${composable.name}: ${composable.signature}\n\`\`\`\n`
      : "") +
    renderDocs(composable.docs)
  );
}

export const composableApiTool = defineMapoTool({
  name: "mapo_composable_api",
  title: "Mapo composables",
  description:
    "The composables and stores Mapo auto-imports into an app (useCrud, useMapoAuth, useMapo, " +
    "useMediaStore…), with their real signatures. Omit `name` to list everything available.",
  inputSchema: {
    name: z
      .string()
      .optional()
      .describe("Composable name, e.g. 'useCrud'. Partial names work."),
  },
  annotations: READ_ONLY,
  inputExamples: [{}, { name: "useCrud" }],
  run: (args: ComposableArgs, context: MapoToolContext) => {
    const { composables } = context.api();

    if (args.name) {
      const composable = findByName(composables, args.name);
      if (!composable) {
        return `No auto-imported composable matches "${args.name}".${suggest(composables, args.name)}`;
      }
      return renderComposable(composable);
    }

    const byPackage = new Map<string, string[]>();
    for (const composable of composables) {
      const list = byPackage.get(composable.pkg) ?? [];
      list.push(composable.name);
      byPackage.set(composable.pkg, list);
    }

    const sections = [...byPackage.entries()].map(
      ([pkg, names]) => `**${pkg}**: ${names.join(", ")}`,
    );

    return (
      `${composables.length} auto-imported composables:\n\n${sections.join("\n")}\n\n` +
      `Call mapo_composable_api({ name }) for a signature.`
    );
  },
});

/** API-surface tools. Static: they read the bundled extraction, not the app. */
export const apiTools: AnyMapoToolSpec[] = [
  componentApiTool,
  fieldTypesTool,
  composableApiTool,
];

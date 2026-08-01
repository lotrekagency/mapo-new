/**
 * Resource payloads, shared by both transports.
 *
 * Resources are what a client can attach to the conversation without calling a
 * tool, so they carry whole documents: a doc page, the contract of a field
 * type, or the index of everything available.
 */
import { RECIPES } from "./recipes.js";
import { getDoc, listDocs } from "./search.js";
import type { ApiKnowledge, DocsKnowledge } from "./types.js";

export const DOCS_URI_PREFIX = "mapo://docs/";
export const FIELD_URI_PREFIX = "mapo://fields/";
export const INDEX_URI = "mapo://knowledge/index";
export const MANIFEST_URI = "mapo://app/manifest";

/** Everything the knowledge base contains, as a compact browsable map. */
export function renderKnowledgeIndex(
  knowledge: DocsKnowledge,
  api: ApiKnowledge,
): string {
  const pages = listDocs(knowledge)
    .map(
      (doc) =>
        `- \`${doc.path}\` — ${doc.title} (${doc.headings.length} sections)`,
    )
    .join("\n");

  const recipes = RECIPES.map(
    (recipe) => `- ${recipe.task} → \`${recipe.doc}\``,
  ).join("\n");

  const components = api.components
    .map((component) => component.name)
    .join(", ");
  const fields = api.fieldTypes.map((field) => field.type).join(", ");
  const composables = api.composables
    .map((composable) => composable.name)
    .join(", ");

  return [
    "# Mapo knowledge base",
    "",
    `Generated ${knowledge.generatedAt}.`,
    "",
    "## Recipes",
    recipes,
    "",
    "## Documentation pages",
    pages,
    "",
    "## Components",
    components,
    "",
    "## Field types",
    fields,
    "",
    "## Auto-imported composables",
    composables,
  ].join("\n");
}

/** One documentation page, whole. */
export function renderDocResource(
  knowledge: DocsKnowledge,
  path: string,
): string | null {
  const doc = getDoc(knowledge, path, { maxChars: 100_000 });
  if (!doc) return null;
  return `# ${doc.title}\n\nsource: \`${doc.path}\`\n\n${doc.content}`;
}

/** The full contract of a field type: attrs, defaults, component, docs. */
export function renderFieldResource(
  api: ApiKnowledge,
  type: string,
): string | null {
  const field = api.fieldTypes.find((entry) => entry.type === type);
  if (!field) return null;

  const attrs = field.attrs.length
    ? field.attrs
        .map(
          (attr) =>
            `- \`${attr.name}\`${attr.type ? `: ${attr.type}` : ""}${attr.required ? " (required)" : ""}` +
            `${attr.description ? ` — ${attr.description}` : ""}`,
        )
        .join("\n")
    : "_none_";

  const common = api.fieldCommon
    .map((member) => `\`${member.name}\``)
    .join(", ");

  return [
    `# Field type \`${field.type}\``,
    "",
    field.description ?? "",
    "",
    `- component: ${field.component ?? "(unmapped)"}`,
    `- descriptor: ${field.descriptor ?? "(none)"}`,
    field.defaultAttrs
      ? `- registry default attrs: \`${JSON.stringify(field.defaultAttrs)}\``
      : "",
    "",
    "## attrs",
    attrs,
    "",
    "## Shared descriptor properties",
    common,
    "",
    field.docs.length
      ? `## Docs\n${field.docs.map((doc) => `- \`${doc}\``).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Doc pages as resource entries, for clients that list what is attachable. */
export function docResourceList(
  knowledge: DocsKnowledge,
): Array<{ uri: string; name: string; description: string; mimeType: string }> {
  return listDocs(knowledge).map((doc) => ({
    uri: `${DOCS_URI_PREFIX}${doc.path}`,
    name: doc.title,
    description: `${doc.section} · ${doc.headings.slice(0, 5).join(", ")}`,
    mimeType: "text/markdown",
  }));
}

/** Field types as resource entries. */
export function fieldResourceList(
  api: ApiKnowledge,
): Array<{ uri: string; name: string; description: string; mimeType: string }> {
  return api.fieldTypes.map((field) => ({
    uri: `${FIELD_URI_PREFIX}${field.type}`,
    name: `Field type: ${field.type}`,
    description:
      field.description ??
      `Rendered by ${field.component ?? "a custom component"}`,
    mimeType: "text/markdown",
  }));
}

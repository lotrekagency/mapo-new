import {
  buildIndex,
  chunkMarkdown,
  KNOWLEDGE_VERSION,
} from "../runtime/core/indexer.js";
import type { DocsKnowledge } from "../runtime/core/types.js";

/** Builds an in-memory knowledge base from `path → markdown` pairs. */
export function makeKnowledge(files: Record<string, string>): DocsKnowledge {
  const chunks = Object.entries(files).flatMap(([path, markdown]) =>
    chunkMarkdown(path, markdown),
  );

  return {
    version: KNOWLEDGE_VERSION,
    generatedAt: new Date(0).toISOString(),
    docsRoot: "docs",
    chunks,
    index: buildIndex(chunks),
  };
}

export const CRUD_LIST_DOC = `# CRUD list view

Build a resource list page using MapoList.

## Minimal example

\`\`\`vue
<MapoList endpoint="/api/articles" detail-base="/articles" />
\`\`\`

## Bulk actions

Pass \`bulkActions\` to run an operation on every selected row.

## Quick edit

Inline editing of a row uses the field registry with \`type: "text"\`.
`;

export const CUSTOM_FIELDS_DOC = `# Custom fields

Register your own field component in the form registry.

## Registering a component

Use \`defineFormField\` in a plugin to add a new field type.

## Overriding defaults

Set \`mapoForm.fields\` in nuxt.config to override attrs per type.
`;

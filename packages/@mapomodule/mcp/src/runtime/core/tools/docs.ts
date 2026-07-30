/** Docs tools: grounded search, curated recipes and exact section retrieval. */
import { z } from "zod";
import { matchRecipes, RECIPES } from "../recipes.js";
import { getDoc, searchDocs } from "../search.js";
import { defineMapoTool } from "../tool-spec.js";
import type { RecipeMatch } from "../recipes.js";
import type { AnyMapoToolSpec, MapoToolContext } from "../tool-spec.js";

/** Curated task hits, rendered above the ranked sections. */
function renderRecipes(recipes: RecipeMatch[]): string {
  if (!recipes.length) return "";

  const lines = recipes.map((recipe) => {
    const section = recipe.heading ? ` (section "${recipe.heading}")` : "";
    const seeAlso = recipe.seeAlso?.length
      ? `\n  see also: ${recipe.seeAlso.join(", ")}`
      : "";
    return `- **${recipe.task}** → \`${recipe.doc}\`${section}\n  ${recipe.summary}${seeAlso}`;
  });

  return `## Canonical recipe${recipes.length > 1 ? "s" : ""} for this task\n${lines.join("\n")}\n\n`;
}

const SECTIONS = [
  "howto",
  "guide",
  "uikit",
  "form",
  "modules",
  "migration",
] as const;

interface SearchDocsArgs {
  query: string;
  section?: (typeof SECTIONS)[number];
  pkg?: string;
  limit?: number;
}

export const searchDocsTool = defineMapoTool({
  name: "mapo_search_docs",
  title: "Search Mapo documentation",
  description:
    "Search the official Mapo documentation and return the most relevant sections (never whole files). " +
    "Use this before writing any Mapo code; follow up with mapo_get_doc to read a full section.",
  inputSchema: {
    query: z
      .string()
      .describe(
        "Natural-language question or keywords, e.g. 'paginated list with filters'",
      ),
    section: z.enum(SECTIONS).optional().describe("Restrict to one docs area"),
    pkg: z
      .string()
      .optional()
      .describe("Restrict to a package, e.g. '@mapomodule/form' or 'uikit'"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Number of sections to return (default 5)"),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    { query: "CRUD list with filters and bulk actions" },
    { query: "custom form field registration", section: "form" },
  ],
  run: (args: SearchDocsArgs, context: MapoToolContext) => {
    const hits = searchDocs(context.knowledge(), args.query, {
      ...(args.section ? { section: args.section } : {}),
      ...(args.pkg ? { pkg: args.pkg } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
    });
    const recipes = renderRecipes(matchRecipes(args.query));

    if (!hits.length) {
      return recipes
        ? `${recipes}No section matched the keywords, but the recipe above covers this task.`
        : `No documentation section matched "${args.query}". Try fewer or more general keywords, or drop the section filter.`;
    }

    const body = hits
      .map(
        (hit, position) =>
          `### ${position + 1}. ${hit.title} — ${hit.heading}\n` +
          `path: \`${hit.path}\`${hit.anchor ? ` · anchor: \`#${hit.anchor}\`` : ""} · score: ${hit.score}\n` +
          (hit.tags.length ? `symbols: ${hit.tags.join(", ")}\n` : "") +
          `\n${hit.snippet}\n`,
      )
      .join("\n---\n\n");

    return (
      `${recipes}${hits.length} matching section(s) for "${args.query}":\n\n${body}\n` +
      `---\nRead a full section with mapo_get_doc({ path, heading }).`
    );
  },
});

interface GetDocArgs {
  path: string;
  heading?: string;
  maxChars?: number;
}

export const getDocTool = defineMapoTool({
  name: "mapo_get_doc",
  title: "Read a Mapo documentation page",
  description:
    "Return the exact markdown of a documentation page, or of one of its sections when `heading` is given. " +
    "Paths come from mapo_search_docs (e.g. 'howto/crud-list.md').",
  inputSchema: {
    path: z
      .string()
      .describe(
        "Doc path relative to the docs root, e.g. 'howto/crud-detail.md'",
      ),
    heading: z
      .string()
      .optional()
      .describe(
        "Section heading or anchor to return instead of the whole page",
      ),
    maxChars: z
      .number()
      .int()
      .min(500)
      .max(40000)
      .optional()
      .describe("Truncation limit (default 8000)"),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    { path: "howto/crud-list.md" },
    { path: "uikit/form/validation.md", heading: "Async validation" },
  ],
  run: (args: GetDocArgs, context: MapoToolContext) => {
    const doc = getDoc(context.knowledge(), args.path, {
      ...(args.heading ? { heading: args.heading } : {}),
      ...(args.maxChars ? { maxChars: args.maxChars } : {}),
    });

    if (!doc) {
      return `No such documentation page: "${args.path}". Use mapo_search_docs to find the correct path.`;
    }

    return (
      `# ${doc.title}\nsource: \`${doc.path}\`\n` +
      `sections: ${doc.headings.join(" · ") || "(none)"}\n\n${doc.content}`
    );
  },
});

interface ListRecipesArgs {
  task?: string;
}

export const listRecipesTool = defineMapoTool({
  name: "mapo_list_recipes",
  title: "List Mapo task recipes",
  description:
    "List the canonical Mapo recipes (task → documentation page). Call this to discover what Mapo " +
    "can do out of the box before designing a solution, or pass `task` to find the recipe for a goal.",
  inputSchema: {
    task: z
      .string()
      .optional()
      .describe(
        "Goal in plain words, e.g. 'let editors reorder navigation entries'",
      ),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [{}, { task: "upload images and pick them in a form" }],
  run: (args: ListRecipesArgs) => {
    if (args.task) {
      const matches = matchRecipes(args.task, 3);
      if (!matches.length) {
        return (
          `No curated recipe matches "${args.task}". Fall back to mapo_search_docs, ` +
          `or call mapo_list_recipes with no argument to see every recipe.`
        );
      }
      return `${renderRecipes(matches)}Read the page with mapo_get_doc({ path }).`;
    }

    const lines = RECIPES.map(
      (recipe) =>
        `- **${recipe.task}** → \`${recipe.doc}\` — ${recipe.summary}`,
    );
    return `${RECIPES.length} Mapo recipes:\n\n${lines.join("\n")}\n\nRead one with mapo_get_doc({ path }).`;
  },
});

/** Tools that work without a running dev server. */
export const docsTools: AnyMapoToolSpec[] = [
  searchDocsTool,
  getDocTool,
  listRecipesTool,
];

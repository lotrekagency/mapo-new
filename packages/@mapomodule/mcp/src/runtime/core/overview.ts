/**
 * Mapo's overview: the "Concepts" docs page, served whole as a resource and
 * summarised at the top of `mapo_list_recipes`. The page is written once, for
 * people and assistants alike; this module only selects from it, so the
 * overview follows the docs on every knowledge build.
 */
import { OVERVIEW_DOC, OVERVIEW_URI, renderDocResource } from "./resources.js";
import { getDoc } from "./search.js";
import type { DocsKnowledge } from "./types.js";

/** The section of the page that `mapo_list_recipes` opens with. */
const SUMMARY_HEADING = "What Mapo is";

/** The whole overview page, or a pointer to the docs when it is not indexed. */
export function renderOverview(knowledge: DocsKnowledge): string {
  return (
    renderDocResource(knowledge, OVERVIEW_DOC) ??
    `The overview page \`${OVERVIEW_DOC}\` is not in this knowledge base. ` +
      "Call mapo_list_recipes or mapo_search_docs instead."
  );
}

/**
 * The prose of the "What Mapo is" section, without its code samples, plus where
 * to read the rest. Null when the page or the section is missing, so callers
 * simply leave it out.
 */
export function overviewSummary(knowledge: DocsKnowledge): string | null {
  const doc = getDoc(knowledge, OVERVIEW_DOC, { heading: SUMMARY_HEADING });
  if (!doc?.headings.includes(SUMMARY_HEADING)) return null;

  const prose = doc.content
    .replace(/^#+ .*\n+/, "")
    .split(/\n```/)[0]!
    .trim()
    // The paragraph that introduces a code sample makes no sense without it.
    .replace(/\n\n[^\n]*:$/, "");
  if (!prose) return null;

  return (
    `${prose}\n\nFull overview: the \`${OVERVIEW_URI}\` resource, or ` +
    `mapo_get_doc({ path: "${OVERVIEW_DOC}" }).`
  );
}

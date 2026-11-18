/**
 * Block-level tags: each one starts a line of its own, and a block that holds
 * other blocks closes on a line of its own, one indent step out.
 */
const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "blockquote",
  "pre",
  "hr",
  "img",
  "div",
  "figure",
  "figcaption",
]);

/** Blocks that hold a line of text: an `<img>` inside one is part of the text. */
const TEXTBLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figcaption",
]);

/** Tags with no closing tag: they never open a level. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** Tags whose content is copied as it is: whitespace is part of the content there. */
const VERBATIM_TAGS = new Set(["pre", "code"]);

/**
 * A comment, a tag (quoted attribute values may hold `>`), a run of text, or a
 * `<` that starts none of them.
 */
const TOKEN =
  /<!--[\s\S]*?-->|<\/?[a-zA-Z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g;
const TAG_NAME = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/;
/** HTML whitespace only: a no-break space is content. */
const BLANK = /^[ \t\n\f\r]*$/;
const LEADING_BLANK = /^[ \t\n\f\r]+/;
const TRAILING_BLANK = /[ \t\n\f\r]+$/;

interface OpenBlock {
  name: string;
  /** Whether a block opened inside it, so its closing tag needs a line of its own. */
  holdsBlocks: boolean;
}

/** What came last: a block's opening tag, the end of a block, or inline content. */
type LastToken = "block-open" | "block-end" | "inline";

/**
 * Lays out an HTML fragment for reading: a line per block-level tag (paragraphs,
 * headings, lists, tables, quotes, `pre`, `hr`, `img`), indented by nesting, with
 * inline content kept on its block's line.
 *
 * The result parses back to the same document: only whitespace between blocks
 * and at the edges of a block is added or dropped, which an HTML parser that
 * collapses whitespace (Tiptap's) ignores. The content of `<pre>` and `<code>`
 * is copied as it is, and an `<img>` inside a line of text stays on that line.
 *
 * @param html The fragment to lay out, typically Tiptap's `editor.getHTML()`.
 * @param indent The string one nesting level adds. Default: two spaces.
 * @returns The fragment over several lines, with no trailing newline.
 */
export function formatHtml(html: string, indent = "  "): string {
  const lines: string[] = [];
  const open: OpenBlock[] = [];
  let line = "";
  let last: LastToken = "block-open";
  let verbatim: { name: string; depth: number } | null = null;

  const startLine = () => {
    const isBlankLine = BLANK.test(line);
    if (!isBlankLine) lines.push(line.replace(TRAILING_BLANK, ""));
    line = indent.repeat(open.length);
  };

  /**
   * Closes the innermost open block named `name`; a block that held other
   * blocks closes on a line of its own. A closing tag with no opening one
   * stays where it is.
   */
  const closeBlock = (name: string, token: string) => {
    let at = open.length - 1;
    while (at >= 0 && open[at]!.name !== name) at -= 1;
    const isStray = at < 0;
    if (isStray) {
      line += token;
      last = "block-end";
      return;
    }
    const holdsBlocks = open[at]!.holdsBlocks;
    open.length = at;
    if (holdsBlocks) startLine();
    line += token;
    last = "block-end";
  };

  for (const [token] of html.matchAll(TOKEN)) {
    const name = TAG_NAME.exec(token)?.[1]?.toLowerCase();
    const isClosing = token.startsWith("</");

    if (verbatim) {
      const isVerbatimTag = name === verbatim.name;
      if (isVerbatimTag && isClosing) verbatim.depth -= 1;
      else if (isVerbatimTag) verbatim.depth += 1;
      const verbatimEnds = verbatim.depth === 0;
      if (!verbatimEnds) {
        line += token;
        continue;
      }
      verbatim = null;
      // `</pre>` closes a block, `</code>` an inline element.
      if (name === "pre") closeBlock(name, token);
      else line += token;
      continue;
    }

    const isBlock = name !== undefined && BLOCK_TAGS.has(name);
    const parent = open.at(-1);
    const isInsideText =
      last === "inline" ||
      (parent !== undefined && TEXTBLOCK_TAGS.has(parent.name));
    const isInlineImage = name === "img" && isInsideText;

    if (!isBlock || isInlineImage) {
      const isText = name === undefined;
      const isBlankBetweenBlocks =
        isText && last !== "inline" && BLANK.test(token);
      if (isBlankBetweenBlocks) continue;
      if (last === "block-end") startLine();
      // Whitespace at the start of a block's text is not content.
      const startsText = isText && last !== "inline";
      line += startsText ? token.replace(LEADING_BLANK, "") : token;
      last = "inline";
      const opensVerbatim =
        name !== undefined && VERBATIM_TAGS.has(name) && !isClosing;
      if (opensVerbatim) verbatim = { name, depth: 1 };
      continue;
    }

    if (isClosing) {
      closeBlock(name, token);
      continue;
    }

    if (parent) parent.holdsBlocks = true;
    startLine();
    line += token;
    const isVoid = VOID_TAGS.has(name) || token.endsWith("/>");
    if (isVoid) {
      last = "block-end";
      continue;
    }
    open.push({ name, holdsBlocks: false });
    last = "block-open";
    if (name === "pre") verbatim = { name, depth: 1 };
  }

  startLine();
  return lines.join("\n");
}

/**
 * Restricted Markdown, the rich text the AI writes: paragraphs, lists
 * (`- ` or `1. `), **bold**, *italic* and [links](https://example.com).
 *
 * Only these constructs become tags, from a closed list: `p`, `ul`, `ol`,
 * `li`, `strong`, `em` and `a` with an `http` or `https` address. Everything
 * else is text, escaped, so no HTML the model writes can reach the page.
 * The rich text editor accepts every one of these tags.
 */

type Inline = "html" | "text";

interface Block {
  kind: "p" | "ul" | "ol";
  /** A paragraph's lines, or a list's items. */
  lines: string[];
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
/** A line of three or more `-`, `*` or `_`: a separator, not a list item. */
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
/**
 * A link: a label of up to 500 characters, an address of up to 2048 with
 * parentheses one level deep. The bounds keep the search linear on a text
 * full of `[`.
 */
const LINK =
  /^\[([^\]\n]{1,500})\]\(((?:[^()\s]|\([^()\s]{0,2048}\)){1,2048})\)/;
/** Markup outside the restricted set, dropped from the start of a line. */
const LINE_MARKUP = /^\s*(?:#{1,6}\s+|>\s?|```.*$)/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An `http` or `https` address, as the browser would read it; `undefined` otherwise. */
function safeHref(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Splits the text into paragraphs and lists, line by line. */
function blocksOf(markdown: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  const close = () => {
    if (current) blocks.push(current);
    current = undefined;
  };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(LINE_MARKUP, "");
    if (!line.trim() || RULE.test(line)) {
      close();
      continue;
    }
    const bullet = BULLET.exec(line);
    // As in CommonMark, only `1.` starts a list inside a paragraph:
    // "2026. Fu un anno" goes on with the text.
    const isInParagraph = current?.kind === "p";
    const numberedLine = bullet ? null : NUMBERED.exec(line);
    const numbered =
      numberedLine && (!isInParagraph || numberedLine[1] === "1")
        ? numberedLine
        : undefined;
    const item = bullet?.[1] ?? numbered?.[2];
    const kind = bullet ? "ul" : numbered ? "ol" : "p";
    if (item !== undefined) {
      if (current?.kind !== kind) close();
      current ??= { kind, lines: [] };
      current.lines.push(item);
      continue;
    }
    // A line after a list item, without its own marker, goes on with it.
    const isListed = current?.kind === "ul" || current?.kind === "ol";
    if (current && isListed) {
      const last = current.lines.length - 1;
      current.lines[last] = `${current.lines[last]} ${line.trim()}`;
      continue;
    }
    current ??= { kind: "p", lines: [] };
    current.lines.push(line.trim());
  }
  close();
  return blocks;
}

/**
 * Bold, italic and links of one line of text, as HTML or as plain text.
 * `links` collects the address of each link that becomes a tag, as written.
 */
function renderInline(
  text: string,
  mode: Inline,
  inLink = false,
  links?: string[],
): string {
  const plain = (value: string) =>
    mode === "html" ? escapeHtml(value) : value;
  let out = "";
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);

    const isBold = rest.startsWith("**");
    const boldEnd = isBold ? text.indexOf("**", index + 2) : -1;
    if (boldEnd > index + 2) {
      const inner = renderInline(
        text.slice(index + 2, boldEnd),
        mode,
        inLink,
        links,
      );
      out += mode === "html" ? `<strong>${inner}</strong>` : inner;
      index = boldEnd + 2;
      continue;
    }

    // `*word*`, never `* ` or ` *`: a star beside a space is text.
    const isItalic = rest.startsWith("*") && !/^\*[\s*]/.test(rest);
    const italicEnd = isItalic ? text.indexOf("*", index + 1) : -1;
    const closesItalic =
      italicEnd > index + 1 && !/\s/.test(text[italicEnd - 1] ?? "");
    if (closesItalic) {
      const inner = renderInline(
        text.slice(index + 1, italicEnd),
        mode,
        inLink,
        links,
      );
      out += mode === "html" ? `<em>${inner}</em>` : inner;
      index = italicEnd + 1;
      continue;
    }

    const link = inLink ? null : LINK.exec(rest);
    if (link) {
      const [whole, label = "", target = ""] = link;
      const inner = renderInline(label, mode, true);
      const href = safeHref(target);
      if (href) links?.push(target);
      out +=
        mode === "html" && href
          ? `<a href="${escapeHtml(href)}">${inner}</a>`
          : inner;
      index += whole.length;
      continue;
    }

    // `\*` and the like: the character itself, never markup.
    const isEscape = rest.startsWith("\\") && /^\\[\\*[\]()_#`>+.-]/.test(rest);
    if (isEscape) {
      out += plain(rest.charAt(1));
      index += 2;
      continue;
    }

    out += plain(rest.charAt(0));
    index += 1;
  }
  return out;
}

/**
 * The HTML of restricted Markdown: only paragraphs, lists, bold, italic and
 * `http(s)` links become tags; any other text, HTML included, is escaped.
 * Lines of one paragraph join with a space; headings, quotes and code
 * fences lose their markers and stay as text. `""` when there is no text.
 *
 * @example
 * markdownToHtml("Opening **tonight**.\n\n- Free entry\n- [Tickets](https://example.com)")
 * // "<p>Opening <strong>tonight</strong>.</p><ul><li>Free entry</li><li><a href=\"https://example.com/\">Tickets</a></li></ul>"
 */
export function markdownToHtml(markdown: string): string {
  return blocksOf(markdown)
    .map((block) => {
      if (block.kind === "p")
        return `<p>${renderInline(block.lines.join(" "), "html")}</p>`;
      const items = block.lines
        .map((line) => `<li>${renderInline(line, "html")}</li>`)
        .join("");
      return `<${block.kind}>${items}</${block.kind}>`;
    })
    .join("");
}

/**
 * The plain text of restricted Markdown, without markup: what a quote of the
 * source can be compared with. Blocks are separated by a line break.
 */
export function markdownToText(markdown: string): string {
  return blocksOf(markdown)
    .flatMap((block) =>
      block.kind === "p"
        ? [renderInline(block.lines.join(" "), "text")]
        : block.lines.map((line) => renderInline(line, "text")),
    )
    .join("\n");
}

/**
 * The addresses of the links of restricted Markdown, as written, once each:
 * only those that become a link in the HTML (`http` and `https`).
 *
 * @example
 * markdownLinks("[Tickets](https://example.com) and [x](javascript:alert(1))")
 * // ["https://example.com"]
 */
export function markdownLinks(markdown: string): string[] {
  const links: string[] = [];
  for (const block of blocksOf(markdown)) {
    const lines = block.kind === "p" ? [block.lines.join(" ")] : block.lines;
    for (const line of lines) renderInline(line, "text", false, links);
  }
  return [...new Set(links)];
}

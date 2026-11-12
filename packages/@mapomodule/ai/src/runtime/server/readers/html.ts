/**
 * The reader of HTML: a page becomes the text a person reads on it, in
 * Markdown, with what Markdown says of its structure: headings, paragraphs,
 * lists, quotes, links, bold and italic, and tables as the spreadsheets'
 * (`markdownTable()`). What a person does not read stays out: scripts and
 * styles, comments, menus (`nav`), the controls of a form, images, and the
 * attributes of the tags but a link's address. When the page marks its main
 * content, with one `<main>` or one `<article>`, only that is read, so its
 * header, footer and sidebars stay out. The page's title and address go on
 * top of its text, and the data it writes for search engines (JSON-LD,
 * Open Graph) in a part of its own. A tokenizer, not a browser: it reads
 * what a page writes, and goes on when the page is not well formed.
 */

import { MAPO_AI_MAX_PART_NAME } from "../../shared/gateway";
import type { MapoAiSourcePart } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { markdownTable } from "./sheets";
import { decodeText, isKnownEncoding } from "./text";
import type { MapoAiReader } from "./types";

/**
 * Elements whose content is text, never tags: never written, read to their
 * end tag. The page's title and its JSON-LD are read from them.
 */
const RAW_TEXT = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);
/** Elements a person does not read: skipped, with everything inside them. */
const SKIPPED = new Set([
  "audio",
  "button",
  "canvas",
  "math",
  "nav",
  "object",
  "select",
  "svg",
  "template",
  "video",
]);
/** Elements that start a block of their own: the text before them is a paragraph. */
const BLOCKS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "hgroup",
  "hr",
  "html",
  "legend",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "ul",
]);
const HEADINGS = /^h([1-6])$/;
const BOLD = new Set(["b", "strong"]);
const ITALIC = new Set(["em", "i"]);
const CELLS = new Set(["td", "th"]);
/** The addresses a link keeps: the web's, an email's and a phone's. */
const KEPT_LINK = /^(?:https?:|mailto:|tel:)/i;
/**
 * The most marks and links open at once. Past them a mark is not written,
 * its text is: closing a mark copies the text it holds, so a page of marks
 * nested without end would cost the square of its length.
 */
const MAX_OPEN_MARKS = 32;
/**
 * The deepest lists and quotes are written: deeper ones are written as the
 * deepest. Each paragraph carries its lists' indent and its quotes' marks,
 * so a page of lists or quotes nested without end would cost its depth for
 * every paragraph.
 */
const MAX_NESTING = 16;
/**
 * Characters a page's text may have: no source `run` takes is longer, and
 * past them the reader refuses the page before its text grows further.
 */
const MAX_WRITTEN = 5_000_000;
/** A tag's name, from its `<`. */
const TAG_NAME = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/y;
/** An attribute: its name, and its value in any of the three ways HTML writes one. */
const ATTRIBUTE =
  /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITY =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));?/g;
/** Whether a tag's source writes a `role`, before it is read. */
const ROLE = /\brole\s*=/i;

/** The labels of the lines a page's text starts with. */
const TITLE_LABEL = "Page title";
const ADDRESS_LABEL = "Page URL";
/**
 * What the part of a page's structured data is named: these words, then
 * the page's name. They come first, since the prompt cuts a long name.
 */
const STRUCTURED_NAME = "Structured data of";
/** Characters of a page's title kept. */
const MAX_TITLE = 300;
/** Blocks of JSON-LD read, and the characters of each: past them a block is left out. */
const MAX_JSON_LD_BLOCKS = 20;
const MAX_JSON_LD_CHARS = 500_000;
/** Characters of a page's structured data, its lines together: the rest is left out. */
const MAX_STRUCTURED_CHARS = 10_000;
/**
 * Characters of one value of the structured data: a longer one, such as an
 * article's body, is in the page's text already.
 */
const MAX_STRUCTURED_VALUE = 1000;
/** Levels of JSON-LD read: deeper values are left out. */
const MAX_STRUCTURED_DEPTH = 8;
/** Keys of JSON-LD that say nothing a person reads. */
const SKIPPED_KEYS = new Set([
  "@context",
  "@id",
  "@language",
  "breadcrumb",
  "potentialAction",
]);
/** Kinds of JSON-LD's nodes that say nothing of a page's content. */
const SKIPPED_TYPES = new Set([
  "BreadcrumbList",
  "ImageObject",
  "SearchAction",
  "SiteNavigationElement",
  "WPFooter",
  "WPHeader",
  "WPSideBar",
]);
/** The `<meta>` properties read as structured data: Open Graph's and its objects'. */
const META_PROPERTY = /^(?:og|article|book|profile):[a-z_:]+$/;
/** Open Graph's media: Mapo reads no image, video or sound. */
const MEDIA_PROPERTY = /^og:(?:image|video|audio)/;
/** The `<meta>` names read as structured data. */
const META_NAMES = new Set(["author", "description"]);

/** Latin-1's named characters, from 160 on. */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
/** The other named characters a page of text writes most. */
const NAMED: Readonly<Record<string, number>> = {
  ...Object.fromEntries(LATIN1.split(" ").map((name, at) => [name, 160 + at])),
  quot: 34,
  amp: 38,
  apos: 39,
  lt: 60,
  gt: 62,
  OElig: 338,
  oelig: 339,
  Scaron: 352,
  scaron: 353,
  Yuml: 376,
  fnof: 402,
  circ: 710,
  tilde: 732,
  ensp: 8194,
  emsp: 8195,
  thinsp: 8201,
  zwnj: 8204,
  zwj: 8205,
  ndash: 8211,
  mdash: 8212,
  lsquo: 8216,
  rsquo: 8217,
  sbquo: 8218,
  ldquo: 8220,
  rdquo: 8221,
  bdquo: 8222,
  dagger: 8224,
  Dagger: 8225,
  bull: 8226,
  hellip: 8230,
  permil: 8240,
  prime: 8242,
  Prime: 8243,
  lsaquo: 8249,
  rsaquo: 8250,
  euro: 8364,
  trade: 8482,
  larr: 8592,
  uarr: 8593,
  rarr: 8594,
  darr: 8595,
  minus: 8722,
  ne: 8800,
  le: 8804,
  ge: 8805,
};

/**
 * A paragraph of the text. The items of one list follow each other without
 * a blank line, and so do the paragraphs of one quote.
 */
interface Block {
  text: string;
  /** The list the paragraph belongs to, counting the lists from 1; 0 for none. */
  list: number;
  /** How many quotes it is in. */
  quotes: number;
}

/** An inline mark waiting for its end tag: the piece its text starts at. */
interface Open {
  at: number;
  kind: MarkKind;
  /** `**` or `*`; none for a link. */
  mark?: string;
  /** A link's address, when it keeps one. */
  href?: string;
}

type MarkKind = "bold" | "italic" | "link";

/** A table being read: its rows, and the row and the cell being written. */
interface Table {
  rows: string[][];
  row?: string[];
  /** The cell's text, in pieces. */
  cell?: string[];
}

/** What {@link scanHtml} meets in a page, in order. */
interface HtmlVisitor {
  /** Text between tags, as the page writes it: its references are not decoded. */
  text(raw: string): void;
  /** A start tag: its name, lowercase, and its source after the name. */
  start(name: string, source: string, isSelfClosing: boolean): void;
  end(name: string): void;
  /** An element whose content is text, never tags (`RAW_TEXT`): its source and its content. */
  raw?(name: string, source: string, content: string): void;
}

/** The element whose content a page's text is read from: its one `<main>`, or its one `<article>`. */
type Region = "main" | "article";

/** What a first reading of a page finds besides its text. */
interface PageFacts {
  title: string;
  /** The `<meta>` read as structured data: `[property or name, content]`, in order. */
  metas: [string, string][];
  /** The address of its `<link rel="canonical">`, as written. */
  canonical?: string;
  /** The address of its `<base>`, as written. */
  base?: string;
  /** The content of its JSON-LD scripts, as written. */
  jsonLd: string[];
  /** Its `<main>` elements, with those whose `role` is `main`. */
  mains: number;
  articles: number;
}

/** What the reader of HTML reads of a page. */
export interface HtmlPage {
  /** The text a person reads on it, in Markdown: its main content, when it marks one. */
  text: string;
  /** Its title: its `<title>`, else its `og:title`. */
  title?: string;
  /**
   * Its address: the one it was read from, else the one it gives itself
   * (`<link rel="canonical">`, `og:url`), when it is the web's.
   */
  address?: string;
  /** What it writes for search engines, as lines `path: value`; `""` for nothing. */
  structured: string;
}

/** Options of {@link readHtmlPage}. */
export interface ReadHtmlPageOptions {
  /** The address the page was read from: its links are read against it. */
  address?: string;
}

/**
 * Reads an HTML page: the text a person reads on it, its title, its address
 * and its structured data. Its relative links are read against its
 * `<base>`, or its address: without either they keep their words only.
 * @param html the page, decoded
 */
export function readHtmlPage(
  html: string,
  options: ReadHtmlPageOptions = {},
): HtmlPage {
  const facts = scanPage(html);
  const address =
    webAddress(options.address) ??
    webAddress(facts.canonical) ??
    webAddress(metaOf(facts, "og:url"));
  const title =
    facts.title || (metaOf(facts, "og:title") ?? "").slice(0, MAX_TITLE);
  return {
    text: markdownOf(html, facts, baseOf(facts.base, address)),
    ...(title ? { title } : {}),
    ...(address ? { address } : {}),
    structured: structuredText(facts),
  };
}

/**
 * The text of an HTML page, in Markdown: its main content when it marks one
 * (one `<main>`, or one `<article>`), else all of it.
 * @param html the page, decoded
 * @param options.base the address its relative links are read against
 */
export function htmlToMarkdown(
  html: string,
  options: { base?: string } = {},
): string {
  const facts = scanPage(html);
  return markdownOf(html, facts, baseOf(facts.base, webAddress(options.base)));
}

/**
 * The parts of a page: its text, its title and address on top, named
 * `name`; and its structured data, in a part of its own. A page with no
 * text gives its structured data alone, with its title and address on top.
 */
export function htmlPageParts(
  page: HtmlPage,
  name: string,
): MapoAiSourcePart[] {
  const head = [
    page.title ? `${TITLE_LABEL}: ${page.title}` : "",
    page.address ? `${ADDRESS_LABEL}: ${page.address}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
  const withHead = (text: string) => (head ? `${head}\n\n${text}` : text);
  const body = page.text.trim();
  const parts: MapoAiSourcePart[] = [];
  if (body) parts.push({ kind: "text", text: withHead(body), name });
  if (page.structured) {
    parts.push({
      kind: "text",
      text: body ? page.structured : withHead(page.structured),
      name: `${STRUCTURED_NAME} ${name}`.slice(0, MAPO_AI_MAX_PART_NAME),
    });
  }
  return parts;
}

/**
 * The text of a page: its main content, when it marks one and that has
 * text, else all of it.
 */
function markdownOf(
  html: string,
  facts: PageFacts,
  base: URL | undefined,
): string {
  const hasOneMain = facts.mains === 1;
  const hasOneArticle = facts.articles === 1;
  let region: Region | undefined;
  if (hasOneMain) region = "main";
  else if (hasOneArticle) region = "article";
  const main = region ? writeMarkdown(html, base, region) : "";
  return main || writeMarkdown(html, base);
}

/**
 * The text of a page, in Markdown: of the region only, when one is given.
 */
function writeMarkdown(
  html: string,
  base: URL | undefined,
  region?: Region,
): string {
  const blocks: Block[] = [];
  // The text being written, in pieces: closing a mark joins only the pieces
  // it holds, so a page of many marks reads in a time that grows with it.
  let paragraph: string[] = [];
  let heading = 0;
  let quotes = 0;
  let preformatted = 0;
  const lists: { ordered: boolean; next: number }[] = [];
  /** The lists met so far, nested ones counted with theirs. */
  let listCount = 0;
  let bullet: string | undefined;
  let opens: Open[] = [];
  /** Marks not written, past `MAX_OPEN_MARKS`, by kind: their end tags close nothing. */
  let unwritten: Record<MarkKind, number> = { bold: 0, italic: 0, link: 0 };
  const forgetMarks = () => {
    opens = [];
    unwritten = { bold: 0, italic: 0, link: 0 };
  };
  let table: Table | undefined;
  /** Tables inside a table's cell: their cells are read as words of that cell. */
  let innerTables = 0;
  /** Lists and quotes opened past `MAX_NESTING`: their end tags close nothing written. */
  let deeperLists = 0;
  let deeperQuotes = 0;
  /** Characters of the blocks written: past `MAX_WRITTEN` the page is refused. */
  let written = 0;
  const keep = (block: Block) => {
    written += block.text.length + 2;
    if (written > MAX_WRITTEN) {
      throw new Error(
        `The page's text passes ${MAX_WRITTEN} characters: no source run takes is longer`,
      );
    }
    blocks.push(block);
  };

  const isInCell = () => table?.cell !== undefined;
  const pieces = () => table?.cell ?? paragraph;
  const append = (text: string) => {
    if (text) pieces().push(text);
  };

  /** Ends the paragraph being written, with the marks of its heading, list and quote. */
  function flush(): void {
    if (isInCell()) {
      append(" ");
      return;
    }
    forgetMarks();
    const written = paragraph.join("");
    paragraph = [];
    const text = preformatted
      ? written.replace(/^\n+/, "").trimEnd()
      : written
          .replace(/ {2,}/g, " ")
          .replace(/ *\n */g, "\n")
          .trim();
    if (!text) return;
    const indent = "  ".repeat(Math.max(0, lists.length - 1));
    const isItem = lists.length > 0;
    let prefix = heading ? `${"#".repeat(heading)} ` : "";
    if (bullet !== undefined) prefix = `${indent}${bullet}`;
    else if (isItem) prefix = `${indent}  `;
    bullet = undefined;
    const lines = `${prefix}${text}`
      .split("\n")
      .map((line, at) => (at && isItem ? `${indent}  ${line}` : line))
      .map((line) => `${"> ".repeat(quotes)}${line}`);
    keep({
      text: lines.join("\n"),
      list: isItem ? listCount : 0,
      quotes,
    });
  }

  /** Closes the inline mark or link opened at `open`, around the text written since. */
  /** Closes the mark open at `index` of `opens`. */
  function close(index: number): void {
    const open = opens[index];
    if (!open) return;
    // What opened after it, inside it, is not closed: it stays text.
    opens.length = index;
    const inner = pieces().splice(open.at).join("");
    const core = inner.trim();
    const lead = inner.slice(0, inner.length - inner.trimStart().length);
    const trail = inner.slice(inner.trimEnd().length);
    let written = core;
    if (core && open.mark) written = `${open.mark}${core}${open.mark}`;
    else if (core && open.href && !isSameAddress(open.href, core)) {
      written = `[${core}](${open.href.replace(/ /g, "%20")})`;
    }
    append(`${lead}${written}${trail}`);
  }

  /** Closes the last mark of a kind still open: an end tag's. */
  function closeLast(kind: MarkKind): void {
    if (unwritten[kind] > 0) {
      unwritten[kind] -= 1;
      return;
    }
    for (let index = opens.length - 1; index >= 0; index -= 1) {
      if (opens[index]?.kind === kind) return close(index);
    }
  }

  function openMark(open: Open): void {
    if (opens.length < MAX_OPEN_MARKS) opens.push(open);
    else unwritten[open.kind] += 1;
  }

  function endCell(): void {
    if (!table || table.cell === undefined) return;
    forgetMarks();
    (table.row ??= []).push(table.cell.join(""));
    table.cell = undefined;
  }

  function endRow(): void {
    endCell();
    if (table?.row) table.rows.push(table.row);
    if (table) table.row = undefined;
  }

  function endTable(): void {
    endRow();
    const rows = table?.rows ?? [];
    table = undefined;
    flush();
    const text = markdownTable(rows);
    if (text) keep({ text, list: 0, quotes: 0 });
  }

  function startTag(name: string, attributes: string) {
    const level = HEADINGS.exec(name)?.[1];
    if (name === "table") {
      if (table) innerTables += 1;
      else {
        flush();
        table = { rows: [] };
      }
      return;
    }
    if (table && innerTables && (name === "tr" || CELLS.has(name))) {
      append(" ");
      return;
    }
    if (table && name === "tr") {
      endRow();
      table.row = [];
      return;
    }
    if (table && CELLS.has(name)) {
      endCell();
      forgetMarks();
      table.cell = [];
      return;
    }
    if (name === "br") {
      append(isInCell() ? " " : "\n");
      return;
    }
    // In a cell, a block is words of the cell: no heading, list or quote.
    if (isInCell() && (level || BLOCKS.has(name))) {
      append(" ");
      return;
    }
    if (level || BLOCKS.has(name)) {
      flush();
      heading = level ? Number(level) : 0;
    }
    if (name === "ul" || name === "ol") {
      if (lists.length >= MAX_NESTING) deeperLists += 1;
      else {
        if (!lists.length) listCount += 1;
        const start = Number(attributeOf(attributes, "start") ?? 1);
        lists.push({
          ordered: name === "ol",
          next: Number.isInteger(start) ? start : 1,
        });
      }
    } else if (name === "li") {
      const list = lists.at(-1);
      bullet = list?.ordered ? `${list.next++}. ` : "- ";
    } else if (name === "blockquote") {
      if (quotes >= MAX_NESTING) deeperQuotes += 1;
      else quotes += 1;
    } else if (name === "pre") preformatted += 1;
    else if (BOLD.has(name)) {
      openMark({ at: pieces().length, kind: "bold", mark: "**" });
    } else if (ITALIC.has(name)) {
      openMark({ at: pieces().length, kind: "italic", mark: "*" });
    } else if (name === "a") {
      const href = linkAddress(
        decodeEntities(attributeOf(attributes, "href") ?? "").trim(),
        base,
      );
      openMark({
        at: pieces().length,
        kind: "link",
        ...(href ? { href } : {}),
      });
    }
  }

  function endTag(name: string): void {
    if (name === "table") {
      if (innerTables) {
        innerTables -= 1;
        append(" ");
      } else if (table) endTable();
      return;
    }
    if (table && innerTables && (name === "tr" || CELLS.has(name))) return;
    if (table && name === "tr") return endRow();
    if (table && CELLS.has(name)) return endCell();
    if (BOLD.has(name)) return closeLast("bold");
    if (ITALIC.has(name)) return closeLast("italic");
    if (name === "a") return closeLast("link");
    const isHeading = HEADINGS.test(name);
    if (!isHeading && !BLOCKS.has(name)) return;
    if (isInCell()) {
      append(" ");
      return;
    }
    flush();
    if (isHeading) heading = 0;
    else if (name === "ul" || name === "ol") {
      if (deeperLists) deeperLists -= 1;
      else lists.pop();
    } else if (name === "blockquote") {
      if (deeperQuotes) deeperQuotes -= 1;
      else quotes = Math.max(0, quotes - 1);
    } else if (name === "pre") preformatted = Math.max(0, preformatted - 1);
  }

  function text(raw: string): void {
    if (!raw) return;
    const decoded = decodeEntities(raw);
    append(preformatted ? decoded : decoded.replace(/\s+/g, " "));
  }

  scanHtml(html, inRegion({ text, start: startTag, end: endTag }, region));
  if (table) endTable();
  flush();
  return blocks
    .map((block, at) => {
      const previous = blocks[at - 1];
      if (!previous) return block.text;
      const isSameList = block.list > 0 && block.list === previous.list;
      const quoted = Math.min(block.quotes, previous.quotes);
      if (isSameList) return `\n${block.text}`;
      if (quoted) return `\n${"> ".repeat(quoted).trimEnd()}\n${block.text}`;
      return `\n\n${block.text}`;
    })
    .join("");
}

/**
 * Walks a page's tags and text, in order, in a time that grows with the
 * page: comments and declarations go, an element of `SKIPPED` goes with
 * everything inside it, and one of `RAW_TEXT` goes to `raw` whole.
 */
function scanHtml(html: string, visitor: HtmlVisitor): void {
  let skipped: { name: string; depth: number } | undefined;
  const text = (raw: string) => {
    if (!skipped) visitor.text(raw);
  };
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open < 0) {
      text(html.slice(index));
      break;
    }
    text(html.slice(index, open));
    index = open;
    if (html.startsWith("<!--", index)) {
      index = after(html, "-->", index + 4);
      continue;
    }
    if (html.startsWith("<![CDATA[", index)) {
      const end = html.indexOf("]]>", index);
      text(html.slice(index + 9, end < 0 ? html.length : end));
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    TAG_NAME.lastIndex = index;
    const tag = TAG_NAME.exec(html);
    if (!tag) {
      const isDeclaration = /^<[!?]/.test(html.slice(index, index + 2));
      if (isDeclaration) index = after(html, ">", index);
      else {
        text("<");
        index += 1;
      }
      continue;
    }
    const isEnd = tag[1] === "/";
    const name = (tag[2] ?? "").toLowerCase();
    const end = tagEnd(html, TAG_NAME.lastIndex);
    const source = html.slice(TAG_NAME.lastIndex, end);
    index = Math.min(html.length, end + 1);
    if (!isEnd && RAW_TEXT.has(name)) {
      // Its content runs to its end tag, whatever it holds.
      const closing = new RegExp(`</${name}\\s*>`, "ig");
      closing.lastIndex = index;
      const found = closing.exec(html);
      const contentEnd = found ? found.index : html.length;
      if (!skipped) visitor.raw?.(name, source, html.slice(index, contentEnd));
      index = found ? found.index + found[0].length : html.length;
      continue;
    }
    if (skipped) {
      if (name === skipped.name) skipped.depth += isEnd ? -1 : 1;
      if (skipped.depth === 0) skipped = undefined;
      continue;
    }
    const isSelfClosing = source.trimEnd().endsWith("/");
    if (isEnd) visitor.end(name);
    else if (!SKIPPED.has(name)) visitor.start(name, source, isSelfClosing);
    else if (!isSelfClosing) skipped = { name, depth: 1 };
  }
}

/**
 * A visitor that passes on only the region: the first element of its kind,
 * from its start tag to its end tag.
 */
function inRegion(
  visitor: HtmlVisitor,
  region: Region | undefined,
): HtmlVisitor {
  if (!region) return visitor;
  let state: "before" | "inside" | "after" = "before";
  let name = "";
  let depth = 0;
  return {
    text(raw) {
      if (state === "inside") visitor.text(raw);
    },
    start(tag, source, isSelfClosing) {
      const isInside = state === "inside";
      const isRegionStart =
        state === "before" && isRegionElement(region, tag, source);
      if (isRegionStart) {
        state = "inside";
        name = tag;
        depth = 1;
      } else if (!isInside) return;
      else if (tag === name && !isSelfClosing) depth += 1;
      visitor.start(tag, source, isSelfClosing);
    },
    end(tag) {
      if (state !== "inside") return;
      if (tag === name) depth -= 1;
      visitor.end(tag);
      if (depth === 0) state = "after";
    },
  };
}

/** Whether an element is of the region's kind: a `<main>` or a `role="main"`; an `<article>`. */
function isRegionElement(
  region: Region,
  name: string,
  source: string,
): boolean {
  if (region === "article") return name === "article";
  return name === "main" || roleOf(source) === "main";
}

/** An element's `role`, lowercase. */
function roleOf(source: string): string | undefined {
  if (!ROLE.test(source)) return undefined;
  return attributeOf(source, "role")?.trim().toLowerCase();
}

/**
 * A first reading of a page: its title, the `<meta>` read as structured
 * data, its canonical address and its `<base>`, its JSON-LD, and how many
 * elements could hold its main content.
 */
function scanPage(html: string): PageFacts {
  const facts: PageFacts = {
    title: "",
    metas: [],
    jsonLd: [],
    mains: 0,
    articles: 0,
  };
  let hasTitle = false;
  scanHtml(html, {
    text: () => undefined,
    end: () => undefined,
    start(name, source) {
      if (name === "main" || roleOf(source) === "main") facts.mains += 1;
      if (name === "article") facts.articles += 1;
      if (name === "meta") readMeta(facts, source);
      else if (name === "link") readCanonical(facts, source);
      else if (name === "base" && facts.base === undefined) {
        const href = attributeOf(source, "href");
        if (href !== undefined) facts.base = decodeEntities(href);
      }
    },
    raw(name, source, content) {
      if (name === "title" && !hasTitle) {
        hasTitle = true;
        facts.title = oneLine(decodeEntities(content)).slice(0, MAX_TITLE);
        return;
      }
      const isJsonLd =
        name === "script" && scriptType(source) === "application/ld+json";
      const hasRoom = facts.jsonLd.length < MAX_JSON_LD_BLOCKS;
      const fits = content.length <= MAX_JSON_LD_CHARS;
      if (isJsonLd && hasRoom && fits) facts.jsonLd.push(content);
    },
  });
  return facts;
}

/** A `<meta>` read as structured data: Open Graph's properties but its media, the description, the author. */
function readMeta(facts: PageFacts, source: string): void {
  const key = (
    attributeOf(source, "property") ??
    attributeOf(source, "name") ??
    ""
  )
    .trim()
    .toLowerCase();
  const content = attributeOf(source, "content");
  if (!key || content === undefined) return;
  const isProperty = META_PROPERTY.test(key) && !MEDIA_PROPERTY.test(key);
  if (!isProperty && !META_NAMES.has(key)) return;
  const value = oneLine(decodeEntities(content));
  if (value) facts.metas.push([key, value]);
}

/** The first `<link rel="canonical">` of a page. */
function readCanonical(facts: PageFacts, source: string): void {
  if (facts.canonical !== undefined) return;
  const rel = (attributeOf(source, "rel") ?? "").toLowerCase().split(/\s+/);
  const href = attributeOf(source, "href");
  if (rel.includes("canonical") && href !== undefined) {
    facts.canonical = decodeEntities(href);
  }
}

/** The first value of a `<meta>` the page writes. */
function metaOf(facts: PageFacts, key: string): string | undefined {
  return facts.metas.find(([one]) => one === key)?.[1];
}

/** A script's type, without its parameters, lowercase. */
function scriptType(source: string): string {
  return (
    (attributeOf(source, "type") ?? "").split(";")[0]?.trim().toLowerCase() ??
    ""
  );
}

/** An address of the web, without its fragment; `undefined` for any other. */
function webAddress(value: string | undefined): string | undefined {
  const written = value?.trim();
  if (!written) return undefined;
  try {
    const url = new URL(written);
    if (!isWebUrl(url)) return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

/** What relative links are read against: the page's `<base>`, read against its address, else its address. */
function baseOf(
  base: string | undefined,
  address: string | undefined,
): URL | undefined {
  const written = base?.trim();
  if (written) {
    try {
      const url = new URL(written, address);
      if (isWebUrl(url)) return url;
    } catch {
      // A `<base>` that cannot be read: the page's address.
    }
  }
  return address ? new URL(address) : undefined;
}

function isWebUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * The address a link keeps: one of the web, an email or a phone, as the
 * page writes it; a relative one read against the base, when there is one.
 * A link to a place of the same page, or to a script, keeps none.
 */
function linkAddress(href: string, base: URL | undefined): string | undefined {
  if (KEPT_LINK.test(href)) return href;
  const isOnPage = href.startsWith("#");
  if (!base || !href || isOnPage) return undefined;
  try {
    const url = new URL(href, base);
    return isWebUrl(url) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** What is spent of the structured data's characters. */
interface Budget {
  left: number;
}

/**
 * A page's structured data, as lines `path: value`: each node of its
 * JSON-LD apart, then the `<meta>` of Open Graph, the description and the
 * author. What says nothing of the content stays out (the context, ids,
 * actions, breadcrumbs, images), and so does a value longer than 1000
 * characters; past 10,000 characters the rest is left out.
 */
function structuredText(facts: PageFacts): string {
  const budget: Budget = { left: MAX_STRUCTURED_CHARS };
  const groups: string[] = [];
  for (const block of facts.jsonLd) {
    for (const node of nodesOf(parseQuietly(block))) {
      const lines: string[] = [];
      flatten(node, "", 0, lines, budget);
      if (lines.length) groups.push(lines.join("\n"));
    }
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of facts.metas) {
    const line = `${key}: ${value}`;
    const isNew = !seen.has(line);
    seen.add(line);
    if (isNew && value.length <= MAX_STRUCTURED_VALUE)
      take(line, lines, budget);
  }
  if (lines.length) groups.push(lines.join("\n"));
  return groups.join("\n\n");
}

/** A block of JSON-LD, parsed; `undefined` when it is no JSON. */
function parseQuietly(block: string): unknown {
  try {
    return JSON.parse(block.trim().replace(/^<!--|-->$/g, ""));
  } catch {
    return undefined;
  }
}

/** The nodes of a block of JSON-LD: its objects, and those of a `@graph` one by one. */
function nodesOf(value: unknown): Record<string, unknown>[] {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item): Record<string, unknown>[] => {
    if (!isRecord(item)) return [];
    const graph = item["@graph"];
    return Array.isArray(graph) ? graph.filter(isRecord) : [item];
  });
}

/** Writes a value of JSON-LD as lines `path: value`, an array's items one after the other. */
function flatten(
  value: unknown,
  path: string,
  depth: number,
  lines: string[],
  budget: Budget,
): void {
  const isTooDeep = depth > MAX_STRUCTURED_DEPTH;
  if (isTooDeep || budget.left <= 0) return;
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, path, depth + 1, lines, budget);
    return;
  }
  if (isRecord(value)) {
    if (isSkippedNode(value)) return;
    if (Object.hasOwn(value, "@value")) {
      flatten(value["@value"], path, depth + 1, lines, budget);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const isInnerType = key === "@type" && path !== "";
      if (SKIPPED_KEYS.has(key) || isInnerType || key === "@graph") continue;
      flatten(item, path ? `${path}.${key}` : key, depth + 1, lines, budget);
    }
    return;
  }
  const text = scalarText(value);
  const isKept =
    text !== "" && path !== "" && text.length <= MAX_STRUCTURED_VALUE;
  if (isKept) take(`${path}: ${text}`, lines, budget);
}

/** Whether a node of JSON-LD is of a kind that says nothing of the content. */
function isSkippedNode(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  const types: unknown[] = Array.isArray(type) ? type : [type];
  return types.some((one) => typeof one === "string" && SKIPPED_TYPES.has(one));
}

/** A value of JSON-LD that is no object or array, on one line; `""` for none. */
function scalarText(value: unknown): string {
  if (typeof value === "string") return oneLine(decodeEntities(value));
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

/** Adds a line while the budget allows: once a line does not fit, none does. */
function take(line: string, lines: string[], budget: Budget): void {
  const cost = line.length + 1;
  if (cost > budget.left) {
    budget.left = 0;
    return;
  }
  lines.push(line);
  budget.left -= cost;
}

/** A text on one line: its runs of white space as one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Where `marker` ends, from `from` on; the end of the text when it is not there. */
function after(html: string, marker: string, from: number): number {
  const at = html.indexOf(marker, from);
  return at < 0 ? html.length : at + marker.length;
}

/**
 * The `>` that ends a tag, from just after its name: a `>` inside an
 * attribute's quoted value does not end it.
 */
function tagEnd(html: string, from: number): number {
  let quote = "";
  let previous = "";
  for (let at = from; at < html.length; at += 1) {
    const char = html.charAt(at);
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    const opensValue = (char === '"' || char === "'") && previous === "=";
    if (opensValue) quote = char;
    else if (char === ">") return at;
    if (!/\s/.test(char)) previous = char;
  }
  return html.length;
}

/** The value of an attribute in a tag's source, as written; `undefined` when it has none. */
function attributeOf(source: string, name: string): string | undefined {
  for (const match of source.matchAll(ATTRIBUTE)) {
    if (match[1]?.toLowerCase() === name) {
      return match[2] ?? match[3] ?? match[4] ?? "";
    }
  }
  return undefined;
}

/**
 * The characters of the text's references: `&amp;`, `&egrave;`, `&#8217;`,
 * `&#x20AC;`. One a page writes in the range of Windows-1252's own
 * characters (`&#146;`) is read as Windows-1252, as browsers do; a name
 * this table does not know stays as it is.
 */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, decimal, hex, name) => {
    if (typeof name === "string") {
      const code = Object.hasOwn(NAMED, name) ? NAMED[name] : undefined;
      return code === undefined || !whole.endsWith(";")
        ? whole
        : String.fromCodePoint(code);
    }
    const code = Number.parseInt(decimal ?? hex ?? "", decimal ? 10 : 16);
    return characterOf(code);
  });
}

function characterOf(code: number): string {
  const isWindows1252 = code >= 0x80 && code <= 0x9f;
  if (isWindows1252 && isKnownEncoding("windows-1252")) {
    return new TextDecoder("windows-1252").decode(new Uint8Array([code]));
  }
  const isCharacter =
    code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return isCharacter ? String.fromCodePoint(code) : "�";
}

/** Whether a link's text says its address already: `info@acme.it` for `mailto:info@acme.it`. */
function isSameAddress(href: string, text: string): boolean {
  const address = href.replace(/^(?:mailto:|tel:)/i, "");
  return text === href || text === address;
}

/**
 * The text of an HTML file's bytes: UTF-8 when they are, else the encoding
 * its media type names (`text/html; charset=…`), else the one the page
 * names in a `<meta>` of its start, else Windows-1252.
 */
function htmlText(bytes: Uint8Array, type: string): string {
  const declared = /;\s*charset\s*=\s*"?([\w.:-]+)/i.exec(type)?.[1];
  const start = Array.from(bytes.subarray(0, 1024), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  const named =
    declared ?? /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(start)?.[1];
  const isUsable =
    named !== undefined && !/^utf-?8$/i.test(named) && isKnownEncoding(named);
  return decodeText(bytes, isUsable ? named : undefined);
}

/** HTML pages: `.html`, `.htm`, `.xhtml`. */
export const htmlReader: MapoAiReader = {
  id: "html",
  label: "HTML",
  extensions: ["html", "htm", "xhtml"],
  types: ["text/html", "application/xhtml+xml"],
  read: (file) =>
    htmlPageParts(readHtmlPage(htmlText(file.bytes, file.type)), file.name),
};

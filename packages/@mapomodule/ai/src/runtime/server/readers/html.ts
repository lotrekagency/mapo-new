/**
 * The reader of HTML: a page becomes the text a person reads on it, in
 * Markdown, with what Markdown says of its structure: headings, paragraphs,
 * lists, quotes, links, bold and italic, and tables as the spreadsheets'
 * (`markdownTable()`). What a person does not read stays out: scripts and
 * styles, the page's title, comments, menus (`nav`), the controls of a
 * form, images, and the attributes of the tags but a link's address. A
 * tokenizer, not a browser: it reads what a page writes, and goes on when
 * the page is not well formed.
 */

import { markdownTable } from "./sheets";
import { decodeText, isKnownEncoding, textParts } from "./text";
import type { MapoAiReader } from "./types";

/** Elements whose content is text, never tags, and not read: skipped to their end tag. */
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
/** A tag's name, from its `<`. */
const TAG_NAME = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/y;
/** An attribute: its name, and its value in any of the three ways HTML writes one. */
const ATTRIBUTE =
  /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITY =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));?/g;

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

/**
 * The text of an HTML page, in Markdown.
 * @param html the page, decoded
 */
export function htmlToMarkdown(html: string): string {
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
  let skipped: { name: string; depth: number } | undefined;
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
    blocks.push({
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
    if (text) blocks.push({ text, list: 0, quotes: 0 });
  }

  function startTag(name: string, attributes: string, isSelfClosing: boolean) {
    if (SKIPPED.has(name)) {
      if (!isSelfClosing) skipped = { name, depth: 1 };
      return;
    }
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
      if (!lists.length) listCount += 1;
      const start = Number(attributeOf(attributes, "start") ?? 1);
      lists.push({
        ordered: name === "ol",
        next: Number.isInteger(start) ? start : 1,
      });
    } else if (name === "li") {
      const list = lists.at(-1);
      bullet = list?.ordered ? `${list.next++}. ` : "- ";
    } else if (name === "blockquote") quotes += 1;
    else if (name === "pre") preformatted += 1;
    else if (BOLD.has(name)) {
      openMark({ at: pieces().length, kind: "bold", mark: "**" });
    } else if (ITALIC.has(name)) {
      openMark({ at: pieces().length, kind: "italic", mark: "*" });
    } else if (name === "a") {
      const href = decodeEntities(attributeOf(attributes, "href") ?? "").trim();
      openMark({
        at: pieces().length,
        kind: "link",
        ...(KEPT_LINK.test(href) ? { href } : {}),
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
    else if (name === "ul" || name === "ol") lists.pop();
    else if (name === "blockquote") quotes = Math.max(0, quotes - 1);
    else if (name === "pre") preformatted = Math.max(0, preformatted - 1);
  }

  function text(raw: string): void {
    if (skipped || !raw) return;
    const decoded = decodeEntities(raw);
    append(preformatted ? decoded : decoded.replace(/\s+/g, " "));
  }

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
      index = found ? found.index + found[0].length : html.length;
      continue;
    }
    if (skipped) {
      if (name === skipped.name) skipped.depth += isEnd ? -1 : 1;
      if (skipped.depth === 0) skipped = undefined;
      continue;
    }
    if (isEnd) endTag(name);
    else startTag(name, source, source.trimEnd().endsWith("/"));
  }
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
 * the page names in a `<meta>` of its start, else Windows-1252.
 */
function htmlText(bytes: Uint8Array): string {
  const start = Array.from(bytes.subarray(0, 1024), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  const named = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(start)?.[1];
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
  read: (file) => textParts(file, htmlToMarkdown(htmlText(file.bytes))),
};

/**
 * The readers of spreadsheets, CSV and XLSX: a sheet goes to the AI whole,
 * as a Markdown table, the first row its header: a row on each line, its
 * cells between `|`, so the AI reads which column a value is in, and a
 * quote of a row finds it as the table writes it. An XLSX gives each of its
 * sheets under a heading with the sheet's name.
 */

import { textParts, decodeText } from "./text";
import type { MapoAiReader } from "./types";

/**
 * The most bytes the parts of an XLSX the reader unzips (its XML) may have:
 * a small file can unzip into gigabytes, and the reader holds what it
 * unzips in memory. A sheet of text the size `run` takes is a few
 * megabytes of XML.
 */
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
/**
 * The most cells the sheets of an XLSX may have, the empty ones up to the
 * last row and column included: the reader fills every one of them in
 * memory, so one cell in the last column of each row costs a whole grid.
 */
const MAX_CELLS = 2_000_000;
/** The most entries an XLSX may have. */
const MAX_ZIP_ENTRIES = 10_000;
/** Significant digits of a number, as a spreadsheet shows them. */
const NUMBER_DIGITS = 15;
/** Delimiters a CSV may use, in the order they are tried. */
const DELIMITERS = ["\t", ";", "|", ","] as const;
/** The rows the delimiter is guessed from. */
const SAMPLE_ROWS = 20;
/** The share of those rows the delimiter must split, its first row among them. */
const SPLIT_SHARE = 0.5;

/**
 * Rows of cells as a Markdown table, the first row its header. A cell
 * keeps its text on one line, with `|` escaped; rows and columns with
 * nothing in them go, and a short row gets empty cells. `""` for no cell.
 */
export function markdownTable(rows: readonly (readonly string[])[]): string {
  const cells = rows
    .map((row) => row.map(cellText))
    .filter((row) => row.some((cell) => cell !== ""));
  const width = cells.reduce((most, row) => Math.max(most, row.length), 0);
  const columns = Array.from({ length: width }, (_, column) => column).filter(
    (column) => cells.some((row) => (row[column] ?? "") !== ""),
  );
  if (!columns.length) return "";
  const lines = cells.map(
    (row) => `| ${columns.map((column) => row[column] ?? "").join(" | ")} |`,
  );
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  return [lines[0], rule, ...lines.slice(1)].join("\n");
}

function cellText(cell: string): string {
  return cell.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

/**
 * The rows of a CSV text, as RFC 4180 writes them: a field between `"`
 * may hold the delimiter, line breaks and `""` for a quote. The delimiter
 * is the one the file names in a first line `sep=;`, as Excel writes it,
 * or the first of tab, `;`, `|` and `,` that splits the first row and at
 * least half of the first twenty: `;` before `,`, since a CSV that writes
 * decimals with a comma separates its fields with `;`.
 */
export function parseCsv(text: string): string[][] {
  const declared = /^sep=([^\n])\n/.exec(text);
  if (declared?.[1]) {
    return csvRows(text.slice(declared[0].length), declared[1]);
  }
  return csvRows(text, guessDelimiter(text));
}

/** The rows of a CSV text with this delimiter, up to `maxRows`. */
export function csvRows(
  text: string,
  delimiter: string,
  maxRows = Infinity,
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let isQuoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (isQuoted) {
      const isEscaped = char === '"' && text.charAt(index + 1) === '"';
      if (isEscaped) {
        field += '"';
        index += 1;
      } else if (char === '"') isQuoted = false;
      else field += char;
      continue;
    }
    // A quote opens a field only at its start; elsewhere it is text.
    if (char === '"' && field === "") isQuoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      if (rows.length >= maxRows) return rows;
      row = [];
      field = "";
    } else field += char;
  }
  const hasLast = field !== "" || row.length > 0;
  if (hasLast) rows.push([...row, field]);
  return rows;
}

/** The delimiter that splits the first rows; `,` when none does. */
function guessDelimiter(text: string): string {
  for (const delimiter of DELIMITERS) {
    const counts = csvRows(text, delimiter, SAMPLE_ROWS)
      .filter((row) => row.some((field) => field.trim() !== ""))
      .map((row) => row.length);
    const [first = 0] = counts;
    const split = counts.filter((count) => count > 1).length;
    const splitsFirst = first > 1;
    const splitsMost = split >= SPLIT_SHARE * counts.length;
    if (splitsFirst && splitsMost) return delimiter;
  }
  return ",";
}

/** CSV and TSV, from the delimiter the file uses. */
export const csvReader: MapoAiReader = {
  id: "csv",
  label: "CSV",
  extensions: ["csv", "tsv"],
  types: ["text/csv", "text/tab-separated-values"],
  read(file) {
    const text = decodeText(file.bytes);
    const isTsv =
      /\.tsv$/i.test(file.name) || file.type === "text/tab-separated-values";
    const rows = isTsv ? csvRows(text, "\t") : parseCsv(text);
    return textParts(file, markdownTable(rows));
  },
};

/**
 * Excel's workbooks, `.xlsx`: every sheet with something in it, under a
 * heading with its name. A cell gives its value, not its format: a date
 * as `2026-03-02`, a number with up to 15 significant digits (`25%` is
 * `0.25`), a formula the value the spreadsheet computed. The old `.xls`
 * is not read.
 */
export const xlsxReader: MapoAiReader = {
  id: "xlsx",
  label: "Excel",
  extensions: ["xlsx"],
  types: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  async read(file) {
    await checkWorkbook(file.bytes);
    // Loaded with the first workbook, so a server that reads none never loads it.
    const { default: readXlsxFile } = await import("read-excel-file/universal");
    const sheets = await readXlsxFile(new Uint8Array(file.bytes).buffer);
    const sections = sheets.flatMap(({ sheet, data }) => {
      const rows = data.map((row) =>
        row.map((cell: unknown) => cellValue(cell)),
      );
      const table = markdownTable(rows);
      return table ? [`## ${sheet.trim() || "Sheet"}\n\n${table}`] : [];
    });
    return textParts(file, sections.join("\n\n"));
  },
};

/** A cell's value as text: as the spreadsheet shows it, without its format. */
function cellValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return numberText(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return dateText(value);
  return "";
}

/** A number with the digits a spreadsheet keeps: `0.30000000000000004` is `0.3`. */
function numberText(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toPrecision(NUMBER_DIGITS)));
}

/**
 * A date as `2026-03-02`, with its time when it has one (`2026-03-02
 * 09:30`); a time alone, which a spreadsheet keeps on the day before 1900,
 * as `09:30`. A spreadsheet's dates have no time zone: the reader gives
 * them in UTC, which writes them as the cell does.
 */
function dateText(date: Date): string {
  const time = date.getTime();
  if (!Number.isFinite(time)) return "";
  const iso = date.toISOString();
  const day = iso.slice(0, 10);
  const clock = iso.slice(11, 19).replace(/:00$/, "");
  const isTimeOnly = time < Date.UTC(1900, 0, 1);
  if (isTimeOnly) return clock;
  return clock === "00:00" ? day : `${day} ${clock}`;
}

/** A part of a ZIP, as its central directory describes it. */
interface ZipEntry {
  name: string;
  /** How it is packed: 0 stored, 8 deflated. */
  method: number;
  /** Its bytes in the file. */
  packed: number;
  /** Its bytes once unzipped, as the directory declares them. */
  size: number;
  /** Where its local header starts. */
  offset: number;
}

/**
 * Refuses an XLSX the reader could not hold, before the reader unzips it.
 * The parts the reader unzips, its XML, are unzipped here first, each up to
 * the size the directory declares (the reader sizes its output by it), and
 * at most `MAX_UNZIPPED_BYTES` together: a part that unzips into more than
 * it declares is a damaged, or crafted, file. Their rows and cells are
 * counted, the empty ones up to the last row and column included, up to
 * `MAX_CELLS`. What is not a ZIP passes: the reader then says the file is
 * no workbook.
 * @throws Error past a bound, or for a ZIP that cannot be read
 */
export async function checkWorkbook(bytes: Uint8Array): Promise<void> {
  let unzipped = 0;
  let cells = 0;
  for (const entry of zipEntries(bytes)) {
    // The reader unzips the XML only; the images and the rest stay packed.
    const isUnzipped =
      entry.name.endsWith(".xml") || entry.name.endsWith(".xml.rels");
    if (!isUnzipped) continue;
    unzipped += entry.size;
    if (unzipped > MAX_UNZIPPED_BYTES) {
      throw new Error(
        `The workbook unzips into more than ${MAX_UNZIPPED_BYTES / 1024 / 1024} MB`,
      );
    }
    const xml = await unzippedEntry(bytes, entry);
    cells += cellsOf(new TextDecoder().decode(xml));
    if (cells > MAX_CELLS) {
      throw new Error(
        `The workbook has more than ${MAX_CELLS} cells, counting the empty ones up to the last row and column of each sheet`,
      );
    }
  }
}

/**
 * The parts of a ZIP, from its central directory: the last end record,
 * as the unzipper finds it. None when the bytes are no ZIP.
 * @throws Error past `MAX_ZIP_ENTRIES`, or for a directory that cannot be read
 */
function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOfCentralDirectory(view);
  if (end < 0) return [];
  const count = view.getUint16(end + 10, true);
  if (count > MAX_ZIP_ENTRIES) {
    throw new Error(`The workbook has more than ${MAX_ZIP_ENTRIES} parts`);
  }
  const entries: ZipEntry[] = [];
  let at = view.getUint32(end + 16, true);
  for (let index = 0; index < count; index += 1) {
    const isEntry =
      at + 46 <= view.byteLength && view.getUint32(at, true) === 0x02014b50;
    if (!isEntry) throw new Error("The workbook's ZIP directory is damaged");
    const nameLength = view.getUint16(at + 28, true);
    entries.push({
      name: new TextDecoder().decode(
        bytes.subarray(at + 46, at + 46 + nameLength),
      ),
      method: view.getUint16(at + 10, true),
      packed: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
    });
    at +=
      46 +
      nameLength +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true);
  }
  return entries;
}

/**
 * The bytes of a part, unzipped, as they stream out: past the size the
 * directory declares it stops, and the part is damaged.
 * @throws Error for a part that is damaged, or packed in a way not read here
 */
async function unzippedEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<Uint8Array> {
  const damaged = () =>
    new Error(`The workbook's part ${entry.name} is damaged`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.offset;
  const hasHeader =
    header + 30 <= view.byteLength &&
    view.getUint32(header, true) === 0x04034b50;
  if (!hasHeader) throw damaged();
  const start =
    header +
    30 +
    view.getUint16(header + 26, true) +
    view.getUint16(header + 28, true);
  if (start + entry.packed > bytes.byteLength) throw damaged();
  const packed = bytes.slice(start, start + entry.packed);
  if (entry.method === 0) {
    if (packed.byteLength !== entry.size) throw damaged();
    return packed;
  }
  if (entry.method !== 8) {
    throw new Error(
      `The workbook's part ${entry.name} is packed in a way not read here`,
    );
  }
  const reader = new Blob([packed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > entry.size) throw damaged();
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw damaged();
  }
  if (size !== entry.size) throw damaged();
  const unzipped = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    unzipped.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return unzipped;
}

/** A row or a cell of a sheet's XML, with its attributes. */
const SHEET_TOKEN = /<(row|c)(?=[\s>/])([^>]*)>/g;
/** The reference of a row or a cell: `r="B12"`, `r="12"`. */
const REFERENCE = /\sr="([A-Z]{0,3})(\d{1,7})"/;

/**
 * The cells of a sheet's grid, as the reader fills it: from the first row
 * to the last, each as wide as the widest, empty cells included. A part
 * that is no sheet has none.
 */
function cellsOf(xml: string): number {
  let rows = 0;
  let lastRow = 0;
  let inRow = 0;
  let widest = 0;
  let lastColumn = 0;
  for (const [, tag, attributes = ""] of xml.matchAll(SHEET_TOKEN)) {
    const reference = REFERENCE.exec(attributes);
    if (tag === "row") {
      rows += 1;
      inRow = 0;
      lastRow = Math.max(lastRow, Number(reference?.[2] ?? 0));
      continue;
    }
    inRow += 1;
    widest = Math.max(widest, inRow);
    lastColumn = Math.max(lastColumn, columnNumber(reference?.[1] ?? ""));
  }
  return Math.max(rows, lastRow) * Math.max(widest, lastColumn);
}

/** A column's number from its letters: `A` is 1, `XFD` 16384. */
function columnNumber(letters: string): number {
  let number = 0;
  for (const letter of letters)
    number = number * 26 + letter.charCodeAt(0) - 64;
  return number;
}

/**
 * Where a ZIP's end of central directory record starts, from the end of
 * the file back over the longest comment; -1 when there is none.
 */
function endOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - 22;
  const first = Math.max(0, last - 0xffff);
  for (let at = last; at >= first; at -= 1) {
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  return -1;
}

/**
 * XLSX files for the tests, written from their XML: a ZIP whose entries are
 * stored as they are, so a test shows what a workbook holds instead of
 * carrying a binary file.
 */

/** A cell: text, a number, a boolean, or a number with a date style (`date`, `datetime`, `time`). */
export type Cell =
  | string
  | number
  | boolean
  | null
  | { serial: number; style: "date" | "datetime" | "time" };

/** The styles of the workbook, by the number of their format: the built-in date, date and time, time. */
const STYLES = { date: 1, datetime: 2, time: 3 } as const;

/** The serial number a spreadsheet keeps for a day: days since 1899-12-30. */
export function serialOf(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** The XML parts of a workbook with these sheets, by their path in the ZIP. */
export function workbookEntries(
  sheets: Record<string, Cell[][]>,
): Record<string, string> {
  const strings: string[] = [];
  const stringAt = (text: string) => {
    const known = strings.indexOf(text);
    if (known >= 0) return known;
    strings.push(text);
    return strings.length - 1;
  };
  const names = Object.keys(sheets);
  const entries: Record<string, string> = {};
  names.forEach((name, at) => {
    const rows = (sheets[name] ?? [])
      .map((row, y) => {
        const cells = row
          .map((cell, x) => cellXml(cell, `${column(x)}${y + 1}`, stringAt))
          .join("");
        return `<row r="${y + 1}">${cells}</row>`;
      })
      .join("");
    entries[`xl/worksheets/sheet${at + 1}.xml`] =
      `<worksheet xmlns="${MAIN}"><sheetData>${rows}</sheetData></worksheet>`;
  });
  entries["[Content_Types].xml"] =
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names
      .map(
        (_, at) =>
          `<Override PartName="/xl/worksheets/sheet${at + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join(
        "",
      )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  entries["_rels/.rels"] =
    `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  entries["xl/workbook.xml"] =
    `<workbook xmlns="${MAIN}" xmlns:r="${REL_TYPE}"><sheets>${names
      .map(
        (name, at) =>
          `<sheet name="${escapeXml(name)}" sheetId="${at + 1}" r:id="rId${at + 1}"/>`,
      )
      .join("")}</sheets></workbook>`;
  entries["xl/_rels/workbook.xml.rels"] =
    `<Relationships xmlns="${RELS}">${names
      .map(
        (_, at) =>
          `<Relationship Id="rId${at + 1}" Type="${REL_TYPE}/worksheet" Target="worksheets/sheet${at + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rIdS" Type="${REL_TYPE}/styles" Target="styles.xml"/><Relationship Id="rIdT" Type="${REL_TYPE}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  entries["xl/styles.xml"] =
    `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="20" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  entries["xl/sharedStrings.xml"] =
    `<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings
      .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
      .join("")}</sst>`;
  return entries;
}

/** A workbook with these sheets, as the bytes of an `.xlsx`, its parts stored. */
export function workbook(
  sheets: Record<string, Cell[][]>,
  options: { declaredSizes?: Record<string, number> } = {},
): Uint8Array {
  return zip(workbookEntries(sheets), options.declaredSizes);
}

/** A workbook with these sheets, its parts deflated, as a spreadsheet writes them. */
export async function deflatedWorkbook(
  sheets: Record<string, Cell[][]>,
): Promise<Uint8Array> {
  return deflatedZip(workbookEntries(sheets));
}

/** A text deflated, as a ZIP packs a part. */
export async function deflateRaw(text: string): Promise<Uint8Array> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A ZIP of these entries, each deflated; `declaredSizes` as for `zip()`. */
export async function deflatedZip(
  entries: Record<string, string>,
  declaredSizes: Record<string, number> = {},
): Promise<Uint8Array> {
  const packed: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) {
    packed[name] = await deflateRaw(content);
  }
  return zip(entries, declaredSizes, packed);
}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function cellXml(
  cell: Cell,
  ref: string,
  stringAt: (text: string) => number,
): string {
  if (cell === null) return "";
  if (typeof cell === "string") {
    return `<c r="${ref}" t="s"><v>${stringAt(cell)}</v></c>`;
  }
  if (typeof cell === "boolean") {
    return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  }
  if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
  return `<c r="${ref}" s="${STYLES[cell.style]}"><v>${cell.serial}</v></c>`;
}

/** A column's letters: 0 is `A`, 26 is `AA`. */
function column(index: number): string {
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A ZIP of these entries, stored without compression unless `packed` gives
 * an entry's deflated bytes. `declaredSizes`
 * makes the central directory say another size for an entry, as a ZIP
 * that unzips into much more than it weighs does.
 */
export function zip(
  entries: Record<string, string>,
  declaredSizes: Record<string, number> = {},
  packed: Record<string, Uint8Array> = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const plain = encoder.encode(content);
    const crc = crc32(plain);
    const data = packed[name] ?? plain;
    const method = packed[name] ? 8 : 0;
    const declared = declaredSizes[name] ?? plain.length;
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, method, true);
    view.setUint16(12, 0x21, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, plain.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const entry = new DataView(central.buffer);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, method, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, declared, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, centrals.length, true);
  view.setUint16(10, centrals.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

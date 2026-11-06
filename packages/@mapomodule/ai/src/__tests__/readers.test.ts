import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  htmlReader,
  htmlToMarkdown,
} from "../runtime/server/readers/html";
import {
  checkWorkbook,
  csvReader,
  markdownTable,
  parseCsv,
  xlsxReader,
} from "../runtime/server/readers/sheets";
import {
  decodeText,
  jsonReader,
  markdownReader,
  textReader,
} from "../runtime/server/readers/text";
import type {
  MapoAiReadFile,
  MapoAiReader,
} from "../runtime/server/readers/types";
import {
  deflatedWorkbook,
  deflatedZip,
  serialOf,
  workbook,
  workbookEntries,
  zip,
} from "./workbooks";

function fileOf(
  name: string,
  content: string | Uint8Array,
  type = "",
): MapoAiReadFile {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return { name, type, bytes };
}

async function textOf(reader: MapoAiReader, file: MapoAiReadFile) {
  const parts = await reader.read(file);
  return parts.map((part) => part.text).join("\n");
}

describe("decodeText", () => {
  it("reads UTF-8, without its byte order mark, with every line break as \\n", () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("perché\r\nsì\rno"),
    ]);

    expect(decodeText(bytes)).toBe("perché\nsì\nno");
  });

  it("reads UTF-16 by its byte order mark", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x63, 0x00, 0xe8, 0x00]);

    expect(decodeText(bytes)).toBe("cè");
  });

  it("reads a file that is not UTF-8 as Windows-1252, as Excel writes it", () => {
    const bytes = new Uint8Array([0x70, 0x65, 0x72, 0x63, 0x68, 0xe9, 0x80]);

    expect(decodeText(bytes)).toBe("perché€");
  });

  it("reads it in the encoding the caller names, when it is not UTF-8", () => {
    expect(decodeText(new Uint8Array([0xa4]), "iso-8859-15")).toBe("€");
  });

  it("refuses bytes that are no text", () => {
    expect(() => decodeText(new Uint8Array([0x50, 0x4b, 0x00, 0x01]))).toThrow(
      "not text",
    );
  });
});

describe("the readers of text", () => {
  it("read a text as the one part of its source, named after the file", async () => {
    const parts = await textReader.read(
      fileOf("note.txt", "\n  Chi siamo  \n"),
    );

    expect(parts).toEqual([
      { kind: "text", text: "Chi siamo", name: "note.txt" },
    ]);
  });

  it("give no part for a file with no text", async () => {
    expect(await textReader.read(fileOf("vuoto.txt", " \n\t "))).toEqual([]);
  });

  it("keep Markdown's marks", async () => {
    const text = "# Chi siamo\n\n**Acme** nasce nel 1987.";

    await expect(textOf(markdownReader, fileOf("a.md", text))).resolves.toBe(
      text,
    );
  });

  it("keep JSON as the file writes it, every digit of a number included", async () => {
    const text = '{"id": 12345678901234567890, "title": "Chi siamo"}';

    await expect(textOf(jsonReader, fileOf("a.json", text))).resolves.toBe(
      text,
    );
  });

  it("refuse a damaged JSON file", async () => {
    await expect(
      Promise.resolve().then(() => jsonReader.read(fileOf("a.json", '{"a": '))),
    ).rejects.toThrow("not JSON");
  });
});

describe("the reader of HTML", () => {
  it("keeps what a person reads, in Markdown, and leaves out the rest", () => {
    const html = `<!DOCTYPE html><html><head><title>Chi siamo | Acme</title>
      <style>p { color: red }</style>
      <script>if (a < b) document.write("<p>no</p>")</script></head>
      <body><nav><ul><li><a href="/">Home</a></li></ul></nav>
      <!-- <p>a comment</p> -->
      <h1>Chi   siamo</h1>
      <p>Acme nasce nel <strong>1987</strong> a <em>Milano</em>,<br>in via&nbsp;Roma 5.</p>
      <svg><text>no</text></svg><button>Invia</button>
      <select><option>no</option></select><template><p>no</p></template>
      </body></html>`;

    expect(htmlToMarkdown(html)).toBe(
      "# Chi siamo\n\nAcme nasce nel **1987** a *Milano*,\nin via Roma 5.",
    );
  });

  it("keeps the address of a link to the web, an email or a phone, and drops the others", () => {
    const html = `<p>Scrivici a <a href="mailto:info@acme.it">info@acme.it</a>,
      leggi <a href="https://acme.it/storia?a=1&amp;b=2">la storia</a>,
      chiama <a href="tel:+390212345">il numero</a>, <a href="javascript:go()">qui</a>
      o <a href="/contatti">contatti</a>.</p>`;

    expect(htmlToMarkdown(html)).toBe(
      "Scrivici a info@acme.it, leggi [la storia](https://acme.it/storia?a=1&b=2), chiama [il numero](tel:+390212345), qui o contatti.",
    );
  });

  it("writes lists, nested and numbered, apart from each other", () => {
    const html = `<ul><li>Uno<ul><li>Uno bis</li></ul></li><li><p>Due</p><p>Altro</p></li></ul>
      <ol start="3"><li>Tre</li><li>Quattro</ol>`;

    expect(htmlToMarkdown(html)).toBe(
      "- Uno\n  - Uno bis\n- Due\n  Altro\n\n3. Tre\n4. Quattro",
    );
  });

  it("writes a quote, its paragraphs together, and keeps preformatted text as it is", () => {
    const html = `<blockquote><p>Una citazione</p><p>su due paragrafi</p></blockquote>
      <pre>  riga uno
    riga due</pre>`;

    expect(htmlToMarkdown(html)).toBe(
      "> Una citazione\n>\n> su due paragrafi\n\n  riga uno\n    riga due",
    );
  });

  it("writes a table as the spreadsheets', a table inside a cell as its words", () => {
    const html = `<table><caption>Orari</caption>
      <tr><th>Giorno</th><th>Ore</th></tr>
      <tr><td>Lun</td><td>9-18 | <a href="https://acme.it">sede</a></td></tr>
      <tr><td>Mar<td><table><tr><td>su</td><td>appuntamento</td></tr></table>
      </table><table><tr><td><ul><li>in una cella</li></ul></td></tr></table>
      <p>Dopo</p>`;

    expect(htmlToMarkdown(html)).toBe(
      [
        "Orari",
        "",
        "| Giorno | Ore |",
        "| --- | --- |",
        "| Lun | 9-18 \\| [sede](https://acme.it) |",
        "| Mar | su appuntamento |",
        "",
        "| in una cella |",
        "| --- |",
        "",
        "Dopo",
      ].join("\n"),
    );
  });

  it("puts a mark inside a link, and the spaces of a mark outside it", () => {
    const html = `<a href="https://acme.it"><b>Ciao</b></a> e <b> spazi </b>fine <i> </i>.`;

    expect(htmlToMarkdown(html)).toBe(
      "[**Ciao**](https://acme.it) e **spazi** fine .",
    );
  });

  it("reads a paragraph of many marks in a time that grows with it", () => {
    // Rewriting the whole paragraph at each mark took about 12 seconds here.
    const html = `<p>${"<b>x</b> ".repeat(200_000)}</p>`;
    const started = performance.now();

    const text = htmlToMarkdown(html);

    expect(performance.now() - started).toBeLessThan(3000);
    expect(text.startsWith("**x** **x**")).toBe(true);
    expect(text.length).toBe(200_000 * 6 - 1);
  });

  it("reads marks nested without end, and end tags with nothing open, in a time that grows with them", () => {
    // Each case took from 9 to 65 seconds when every mark was written, and
    // every end tag searched a copy of the marks still open.
    const pages = [
      `${"<b>".repeat(80_000)}x${"</b>".repeat(80_000)}`,
      `${"<b>".repeat(80_000)}x${"</i>".repeat(80_000)}`,
      `<pre>a${" \n".repeat(200_000)}b</pre>`,
    ];

    for (const html of pages) {
      const started = performance.now();
      htmlToMarkdown(html);
      expect(performance.now() - started).toBeLessThan(3000);
    }
  });

  it("writes the marks past 32 open at once as their text, and closes the others where they end", () => {
    const deep = `${"<i>".repeat(40)}x${"</i>".repeat(40)} <b>y</b>`;

    expect(htmlToMarkdown(deep)).toBe(
      `${"*".repeat(32)}x${"*".repeat(32)} **y**`,
    );
  });

  it("reads a page that is not well formed", () => {
    const html = `<div a='x>y' b="c>d">attributi</div><p>uno<p>due & tre < quattro`;

    expect(htmlToMarkdown(html)).toBe(
      "attributi\n\nuno\n\ndue & tre < quattro",
    );
  });

  it("reads the characters a page writes as references", () => {
    expect(
      decodeEntities(
        "L&#146;anno &egrave; il &#8220;2026&#8221; &amp; &#x20AC; &unknown; &amp",
      ),
    ).toBe("L’anno è il “2026” & € &unknown; &amp");
  });

  it("reads a page in the encoding its <meta> names, when it is not UTF-8", async () => {
    const head = new TextEncoder().encode(
      '<html><head><meta charset="iso-8859-15"></head><body><p>Prezzo: ',
    );
    const bytes = new Uint8Array([...head, 0xa4, 0x20, 0x35]);

    await expect(textOf(htmlReader, fileOf("a.html", bytes))).resolves.toBe(
      "Prezzo: € 5",
    );
  });
});

describe("the reader of CSV", () => {
  it("reads quoted fields, with the delimiter, line breaks and quotes in them", () => {
    const text = 'Nome,Note\n"Rossi, Mario","Dice ""ciao""\nsu due righe"\n';

    expect(parseCsv(text)).toEqual([
      ["Nome", "Note"],
      ["Rossi, Mario", 'Dice "ciao"\nsu due righe'],
    ]);
  });

  it("takes ; for a CSV that writes decimals with a comma", () => {
    expect(parseCsv("Prodotto;Prezzo\nSedia;12,50\nTavolo;99,90")).toEqual([
      ["Prodotto", "Prezzo"],
      ["Sedia", "12,50"],
      ["Tavolo", "99,90"],
    ]);
  });

  it("takes , when ; splits the first row but not most of the others", () => {
    expect(parseCsv("Nome;Cognome,Note\nMario,Rossi\nAnna,Bianchi")).toEqual([
      ["Nome;Cognome", "Note"],
      ["Mario", "Rossi"],
      ["Anna", "Bianchi"],
    ]);
  });

  it("takes a tab, and the delimiter a first line sep= names", () => {
    expect(parseCsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("sep=|\na|b;c\nd|e")).toEqual([
      ["a", "b;c"],
      ["d", "e"],
    ]);
  });

  it("writes a sheet as a Markdown table, without its empty rows and columns", async () => {
    const text = "Nome;;Città\n;;\nRossi;;Milano;\nVerdi\n";

    await expect(textOf(csvReader, fileOf("persone.csv", text))).resolves.toBe(
      "| Nome | Città |\n| --- | --- |\n| Rossi | Milano |\n| Verdi |  |",
    );
  });

  it("reads a .tsv by its tabs, and a CSV Excel wrote in Windows-1252", async () => {
    const tsv = fileOf("a.tsv", "a,b\tc\n1\t2");
    const latin = fileOf(
      "a.csv",
      new Uint8Array([0x63, 0x69, 0x74, 0x74, 0xe0, 0x3b, 0x78, 0x0a]),
    );

    await expect(textOf(csvReader, tsv)).resolves.toBe(
      "| a,b | c |\n| --- | --- |\n| 1 | 2 |",
    );
    await expect(textOf(csvReader, latin)).resolves.toBe(
      "| città | x |\n| --- | --- |",
    );
  });

  it("escapes | and keeps a cell on one line", () => {
    expect(markdownTable([["a|b", "c\nd"]])).toBe(
      "| a\\|b | c d |\n| --- | --- |",
    );
  });
});

describe("the reader of XLSX", () => {
  it("writes each sheet with something in it under its name, a cell by its value", async () => {
    const day = serialOf(2026, 3, 2);
    const bytes = workbook({
      Listino: [
        ["Prodotto", "Prezzo", "Disponibile", "Uscita", "Ora", "Note"],
        [
          "Sedia Nora",
          120.5,
          true,
          { serial: day, style: "date" },
          { serial: 0.5, style: "time" },
          "Rovere | massello",
        ],
        [null, null, null, null, null, null],
        [
          "Tavolo Alto",
          0.30000000000000004,
          false,
          { serial: day + 0.3958333333333333, style: "datetime" },
          null,
          null,
        ],
      ],
      Vuoto: [],
      Note: [["Prezzi IVA esclusa"]],
    });

    await expect(textOf(xlsxReader, fileOf("listino.xlsx", bytes))).resolves
      .toBe(`## Listino

| Prodotto | Prezzo | Disponibile | Uscita | Ora | Note |
| --- | --- | --- | --- | --- | --- |
| Sedia Nora | 120.5 | TRUE | 2026-03-02 | 12:00 | Rovere \\| massello |
| Tavolo Alto | 0.3 | FALSE | 2026-03-02 09:30 |  |  |

## Note

| Prezzi IVA esclusa |
| --- |`);
  });

  it("gives no part for a workbook with nothing in it", async () => {
    const bytes = workbook({ Foglio1: [], Foglio2: [[null]] });

    await expect(xlsxReader.read(fileOf("vuoto.xlsx", bytes))).resolves.toEqual(
      [],
    );
  });

  it("refuses a file that is no workbook, as the old .xls", async () => {
    const xls = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);

    await expect(
      xlsxReader.read(fileOf("vecchio.xlsx", xls)),
    ).rejects.toThrow();
    await expect(
      xlsxReader.read(fileOf("finto.xlsx", "Prodotto;Prezzo")),
    ).rejects.toThrow();
  });

  it("reads a workbook whose parts are deflated, as a spreadsheet writes them", async () => {
    const bytes = await deflatedWorkbook({
      Listino: [["Prodotto"], ["Sedia"]],
    });

    await expect(
      textOf(xlsxReader, fileOf("listino.xlsx", bytes)),
    ).resolves.toBe("## Listino\n\n| Prodotto |\n| --- |\n| Sedia |");
  });

  it("refuses a workbook whose XML would unzip into more than 20 MB, before unzipping it", async () => {
    const bomb = workbook(
      { Foglio1: [["a"]] },
      { declaredSizes: { "xl/worksheets/sheet1.xml": 21 * 1024 * 1024 } },
    );

    await expect(xlsxReader.read(fileOf("bomba.xlsx", bomb))).rejects.toThrow(
      "unzips into more than 20 MB",
    );
  });

  it("refuses a part that unzips into more than its directory declares, without unzipping it all", async () => {
    // A valid sheet with 4 MB of spaces after it, declared as 100 bytes:
    // the reader would unzip it all, whatever the directory says.
    const entries = workbookEntries({ Foglio1: [["a"]] });
    const sheet = "xl/worksheets/sheet1.xml";
    entries[sheet] = `${entries[sheet] ?? ""}${" ".repeat(4 * 1024 * 1024)}`;
    const bomb = await deflatedZip(entries, { [sheet]: 100 });

    await expect(xlsxReader.read(fileOf("bomba.xlsx", bomb))).rejects.toThrow(
      "part xl/worksheets/sheet1.xml is damaged",
    );
  });

  it("refuses a sheet whose grid would hold more than 2 million cells, its empty ones included", async () => {
    // One cell in the last column of each row: the reader fills every row
    // up to that column.
    const entries = workbookEntries({ Foglio1: [["a"]] });
    const rows = Array.from(
      { length: 200 },
      (_, at) =>
        `<row r="${at + 1}"><c r="XFD${at + 1}" t="inlineStr"><is><t>x</t></is></c></row>`,
    ).join("");
    entries["xl/worksheets/sheet1.xml"] =
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

    await expect(
      xlsxReader.read(fileOf("rado.xlsx", zip(entries))),
    ).rejects.toThrow("more than 2000000 cells");
  });

  it("counts only the XML the reader unzips, never the images", async () => {
    const pictures = zip(
      { "xl/workbook.xml": "<workbook/>", "xl/media/image1.png": "png" },
      { "xl/media/image1.png": 900 * 1024 * 1024 },
    );

    await expect(checkWorkbook(pictures)).resolves.toBeUndefined();
  });

  it("refuses a ZIP whose directory says too many parts, or cannot be read", async () => {
    const many = zip({ "a.xml": "a" });
    const end = many.length - 22;
    new DataView(many.buffer).setUint16(end + 10, 10_001, true);
    const damaged = zip({ "a.xml": "a" });
    new DataView(damaged.buffer).setUint32(damaged.length - 22 + 16, 3, true);

    await expect(checkWorkbook(many)).rejects.toThrow("more than 10000 parts");
    await expect(checkWorkbook(damaged)).rejects.toThrow(
      "directory is damaged",
    );
  });
});

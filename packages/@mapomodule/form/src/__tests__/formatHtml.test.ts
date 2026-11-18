import { describe, expect, it } from "vitest";

import { formatHtml } from "../runtime/utils/formatHtml.js";

// The HTML source view lays out the editor's HTML with this formatter. Tiptap
// gives it as one line; the layout must only add whitespace an HTML parser
// that collapses whitespace ignores.

describe("formatHtml", () => {
  it("puts each block on a line of its own and keeps inline content on its block's line", () => {
    expect(
      formatHtml(
        '<h2>Title</h2><p>Some <strong>bold</strong> and <a href="/x">a link</a>.</p><hr><blockquote><p>Quote</p></blockquote>',
      ),
    ).toBe(
      [
        "<h2>Title</h2>",
        '<p>Some <strong>bold</strong> and <a href="/x">a link</a>.</p>',
        "<hr>",
        "<blockquote>",
        "  <p>Quote</p>",
        "</blockquote>",
      ].join("\n"),
    );
  });

  it("indents nested lists", () => {
    expect(
      formatHtml(
        "<ul><li><p>a</p></li><li><p>b</p><ol><li><p>c</p></li></ol></li></ul>",
      ),
    ).toBe(
      [
        "<ul>",
        "  <li>",
        "    <p>a</p>",
        "  </li>",
        "  <li>",
        "    <p>b</p>",
        "    <ol>",
        "      <li>",
        "        <p>c</p>",
        "      </li>",
        "    </ol>",
        "  </li>",
        "</ul>",
      ].join("\n"),
    );
  });

  it("lays out a table as Tiptap gives it", () => {
    expect(
      formatHtml(
        '<table style="min-width: 25px"><colgroup><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th></tr><tr><td colspan="1" rowspan="1"><p>1</p></td></tr></tbody></table>',
      ),
    ).toBe(
      [
        '<table style="min-width: 25px">',
        "  <colgroup>",
        '    <col style="min-width: 25px">',
        "  </colgroup>",
        "  <tbody>",
        "    <tr>",
        '      <th colspan="1" rowspan="1">',
        "        <p>A</p>",
        "      </th>",
        "    </tr>",
        "    <tr>",
        '      <td colspan="1" rowspan="1">',
        "        <p>1</p>",
        "      </td>",
        "    </tr>",
        "  </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("keeps a cell's text on the cell's line", () => {
    expect(formatHtml("<table><tr><td>1</td><td>2</td></tr></table>")).toBe(
      [
        "<table>",
        "  <tr>",
        "    <td>1</td>",
        "    <td>2</td>",
        "  </tr>",
        "</table>",
      ].join("\n"),
    );
  });

  it("copies the content of pre and code as it is", () => {
    const code =
      '<pre><code class="language-js">if (a) {\n  <p>not a block</p>\n}</code></pre>';
    expect(formatHtml(`${code}<p>after</p>`)).toBe(`${code}\n<p>after</p>`);
    expect(
      formatHtml("<p>Run <code>a  <ul> b</code> twice</p><p>next</p>"),
    ).toBe("<p>Run <code>a  <ul> b</code> twice</p>\n<p>next</p>");
  });

  it("gives a block image a line, and leaves an image inside text where it is", () => {
    expect(
      formatHtml(
        '<p>Before</p><img src="a.png" alt="a > b"><p>Text <img src="b.png"> text</p><p><img src="c.png">caption</p>',
      ),
    ).toBe(
      [
        "<p>Before</p>",
        '<img src="a.png" alt="a > b">',
        '<p>Text <img src="b.png"> text</p>',
        '<p><img src="c.png">caption</p>',
      ].join("\n"),
    );
  });

  it("gives text between blocks a line", () => {
    expect(formatHtml("<p>a</p>loose <em>text</em><p>b</p>")).toBe(
      "<p>a</p>\nloose <em>text</em>\n<p>b</p>",
    );
  });

  it("leaves an empty document and plain text as they are", () => {
    expect(formatHtml("")).toBe("");
    expect(formatHtml("<p></p>")).toBe("<p></p>");
    expect(formatHtml("plain <b>text</b>")).toBe("plain <b>text</b>");
  });

  it("gives the same layout when run on its own output", () => {
    const html =
      "<h2>T</h2><ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul><table><tbody><tr><td><p>1</p></td></tr></tbody></table><pre><code>x\n  y</code></pre><p>a</p>tail<p>b</p>";
    const once = formatHtml(html);
    expect(formatHtml(once)).toBe(once);
  });

  it("drops only whitespace at the edges of blocks", () => {
    // A no-break space is content, not layout.
    expect(formatHtml("<p> a </p>\n\n<p> </p>")).toBe("<p>a </p>\n<p> </p>");
  });

  it("keeps a closing tag that has no opening one", () => {
    expect(formatHtml("<p>a</p></div><p>b</p>")).toBe(
      "<p>a</p></div>\n<p>b</p>",
    );
  });
});

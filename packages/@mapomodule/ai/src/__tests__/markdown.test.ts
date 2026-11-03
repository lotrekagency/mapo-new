import { describe, expect, it } from "vitest";
import {
  markdownLinks,
  markdownToHtml,
  markdownToText,
} from "../runtime/shared/markdown";

describe("markdownToHtml — the restricted set", () => {
  it.each([
    ["one paragraph", "Opening tonight.", "<p>Opening tonight.</p>"],
    [
      "paragraphs split by a blank line",
      "One.\n\nTwo.",
      "<p>One.</p><p>Two.</p>",
    ],
    [
      "lines of one paragraph, joined",
      "First line\nsecond line",
      "<p>First line second line</p>",
    ],
    [
      "a bulleted list",
      "- One\n- Two\n* Three",
      "<ul><li>One</li><li>Two</li><li>Three</li></ul>",
    ],
    ["a numbered list", "1. One\n2) Two", "<ol><li>One</li><li>Two</li></ol>"],
    [
      "a paragraph right before a list",
      "Programme:\n- Talk\n- Dinner",
      "<p>Programme:</p><ul><li>Talk</li><li>Dinner</li></ul>",
    ],
    [
      "a line that goes on with a list item",
      "- A long item\n  that goes on",
      "<ul><li>A long item that goes on</li></ul>",
    ],
    [
      "bold and italic",
      "**Free** entry, *every* day",
      "<p><strong>Free</strong> entry, <em>every</em> day</p>",
    ],
    [
      "italic inside bold",
      "**very *fine* print**",
      "<p><strong>very <em>fine</em> print</strong></p>",
    ],
    [
      "a link",
      "[Tickets](https://example.com/tickets?a=1&b=2)",
      '<p><a href="https://example.com/tickets?a=1&amp;b=2">Tickets</a></p>',
    ],
    [
      "a bold link label",
      "[**Tickets**](https://example.com)",
      '<p><a href="https://example.com/"><strong>Tickets</strong></a></p>',
    ],
  ])("writes %s", (_case, markdown, html) => {
    expect(markdownToHtml(markdown)).toBe(html);
  });

  it("gives nothing for blank text", () => {
    expect(markdownToHtml("  \n\n \n")).toBe("");
  });
});

describe("markdownToHtml — everything else is text", () => {
  it.each([
    [
      "HTML tags",
      '<script>alert("x")</script><b>bold</b>',
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;b&gt;bold&lt;/b&gt;</p>",
    ],
    [
      "an event handler in an image tag",
      '<img src=x onerror="alert(1)">',
      "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
    ],
    ["a javascript: link", "[click](javascript:alert(1))", "<p>click</p>"],
    ["a data: link", "[x](data:text/html,hi)", "<p>x</p>"],
    ["a relative link", "[home](/admin)", "<p>home</p>"],
    [
      "parentheses in an address",
      "[Pisa](https://it.wikipedia.org/wiki/Pisa_(citt%C3%A0))",
      '<p><a href="https://it.wikipedia.org/wiki/Pisa_(citt%C3%A0)">Pisa</a></p>',
    ],
    [
      "a quote in a link target",
      '[x](https://example.com/"onmouseover="alert(1))',
      '<p><a href="https://example.com/%22onmouseover=%22alert(1)">x</a></p>',
    ],
    ["entities", "Fish &amp; chips", "<p>Fish &amp;amp; chips</p>"],
    ["a heading marker", "## Programme", "<p>Programme</p>"],
    ["a quote marker", "> Said so", "<p>Said so</p>"],
    ["a code fence", "```\ncode\n```", "<p>code</p>"],
    ["an unclosed star", "2 * 3 = 6", "<p>2 * 3 = 6</p>"],
    ["an escaped star", "\\*not italic\\*", "<p>*not italic*</p>"],
    ["underscores", "snake_case_name", "<p>snake_case_name</p>"],
    ["a separator line", "One\n* * *\nTwo", "<p>One</p><p>Two</p>"],
    [
      "a year at the start of a paragraph line",
      "Fondato nel\n2026. Oggi riapre.",
      "<p>Fondato nel 2026. Oggi riapre.</p>",
    ],
  ])("escapes %s", (_case, markdown, html) => {
    expect(markdownToHtml(markdown)).toBe(html);
  });

  it("never writes a tag outside the closed list, nor an attribute but href", () => {
    const tricky = [
      "<a href=x>a</a> [b](https://e.com) **<i>c</i>** *d*",
      "- <ul><li>x</li></ul>\n1. <p onclick=1>y</p>",
      "[a](https://e.com)[b](javascript:x)<style>p{}</style>",
    ].join("\n\n");
    const html = markdownToHtml(tricky);
    const tags = [...html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)];

    for (const [, name = "", attributes = ""] of tags) {
      expect(["p", "ul", "ol", "li", "strong", "em", "a"]).toContain(name);
      const isAllowed =
        attributes === "" || /^ href="https?:\/\/[^"]*"$/.test(attributes);
      expect(isAllowed, attributes).toBe(true);
    }
  });
});

describe("markdownToHtml — size", () => {
  it("stays linear on a text full of brackets", () => {
    const started = performance.now();
    const html = markdownToHtml("[".repeat(100_000));

    expect(html).toBe(`<p>${"[".repeat(100_000)}</p>`);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("markdownToText", () => {
  it("keeps the words, without markup, one block per line", () => {
    expect(
      markdownToText(
        "**Free** entry.\n\n- [Tickets](https://e.com)\n- *Dinner*",
      ),
    ).toBe("Free entry.\nTickets\nDinner");
  });
});

describe("markdownLinks", () => {
  it("lists the address of each link that becomes a tag, as written, once", () => {
    expect(
      markdownLinks(
        [
          "Info su [il sito](https://teatro.it) e [i biglietti](http://teatro.it/biglietti).",
          "- [**Ancora** il sito](https://teatro.it)",
          "Mai: [x](javascript:alert(1)), [y](mailto:info@teatro.it), [z](teatro.it).",
        ].join("\n"),
      ),
    ).toEqual(["https://teatro.it", "http://teatro.it/biglietti"]);
  });

  it("lists nothing for text without links", () => {
    expect(markdownLinks("**Grande festa** per tutti")).toEqual([]);
  });
});

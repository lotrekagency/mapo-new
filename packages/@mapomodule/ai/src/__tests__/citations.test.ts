import { describe, expect, it } from "vitest";
import {
  holds,
  isQuoted,
  normalizeText,
  numbersIn,
  searchableSource,
} from "../runtime/shared/citations";

describe("normalizeText", () => {
  it("compares text as a copy would write it", () => {
    expect(normalizeText("  L’Opera “Riapre” — il Teatro… ")).toBe(
      'l\'opera "riapre" - il teatro...',
    );
  });

  it("drops soft hyphens and reads compatibility forms", () => {
    expect(normalizeText("re­stauro ﬁne")).toBe("restauro fine");
  });
});

describe("isQuoted", () => {
  const source = [
    "Comunicato – 14 ottobre 2026.",
    "Dopo due anni di lavo-",
    "ri riapre il Teatro Verdi. L’ex-",
    "ministro sarà presente.",
  ].join("\n");
  const readings = searchableSource(source);

  it.each([
    ["with other case and spaces", "dopo  DUE anni"],
    ["of two words", "Teatro Verdi"],
    ["with a plain dash for a typographic one", "Comunicato - 14 ottobre"],
    ["across a word split at the end of a line", "di lavori riapre"],
    ["across a compound split at the end of a line", "L'ex-ministro"],
    ["in parts, with an ellipsis", "Dopo due anni … il Teatro Verdi"],
    ["in parts, with three dots", "Comunicato ... sarà presente"],
  ])("finds a quote %s", (_case, quote) => {
    expect(isQuoted(readings, quote)).toBe(true);
  });

  it.each([
    ["missing from the source", "Teatro Rossini"],
    ["with its parts out of order", "Teatro Verdi ... Dopo due anni"],
    ["empty", "   "],
    ["only an ellipsis", "..."],
    ["of one word only", "Teatro"],
    ["inside a longer word", "ver"],
    ["of a number inside a longer one", "20 26"],
    ["with a part that has no word", "Dopo due anni ... ."],
  ])("does not find a quote %s", (_case, quote) => {
    expect(isQuoted(readings, quote)).toBe(false);
  });
});

describe("holds", () => {
  it("finds one text in another after normalization", () => {
    expect(holds("Riapre il “Teatro” Verdi", 'teatro" verdi')).toBe(true);
    expect(holds("Riapre il Teatro", "Teatro Verdi")).toBe(false);
  });

  it("finds whole words only", () => {
    expect(holds("Teatro Verdi", "ver")).toBe(false);
    expect(holds("agricultural", "cultura")).toBe(false);
    expect(holds("ottobre 2026", "2")).toBe(false);
  });

  it("never holds blank text", () => {
    expect(holds("Riapre", "  ")).toBe(false);
  });
});

describe("numbersIn", () => {
  it.each([
    ["a plain number", "Posti: 120", [120]],
    ["nothing for a separator that could mean both", "1.500 euro", []],
    ["a decimal comma", "12,5 euro", [12.5]],
    ["a decimal point", "1.5 km", [1.5]],
    ["thousands and decimals", "1.234,56 euro", [1234.56]],
    ["repeated thousands", "1.234.567 abitanti", [1234567]],
    ["nothing for a date written with dots", "14.10.2026", []],
    ["an apostrophe and a non-breaking space", "1'200 e 3 400", [1200, 3400]],
    ["a minus sign", "−5 gradi", [-5]],
    ["numbers apart by a plain space", "Via Roma 1 20121 Milano", [1, 20121]],
  ])("reads %s", (_case, text, numbers) => {
    expect(numbersIn(text).sort((a, b) => a - b)).toEqual(
      [...numbers].sort((a, b) => a - b),
    );
  });
});

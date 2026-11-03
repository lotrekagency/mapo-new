import { describe, expect, it } from "vitest";
import {
  holds,
  isOneWord,
  isQuoted,
  normalizeText,
  numbersIn,
  searchableSource,
  writesDate,
  writesDateTime,
  writesLink,
  writesTime,
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
    expect(isQuoted(readings, quote, "unique")).toBe(true);
  });

  it.each([
    ["missing from the source", "Teatro Rossini"],
    ["with its parts out of order", "Teatro Verdi ... Dopo due anni"],
    ["empty", "   "],
    ["only an ellipsis", "..."],
    ["inside a longer word", "ver"],
    ["of a number inside a longer one", "20 26"],
    ["with a part that has no word", "Dopo due anni ... ."],
  ])("does not find a quote %s", (_case, quote) => {
    expect(isQuoted(readings, quote, "unique")).toBe(false);
  });
});

describe("isQuoted — one word", () => {
  const readings = searchableSource(
    [
      "Attributo 7: alluminio anodizzato. Attributo 12: impilabile.",
      "Colore: rosso. Finitura: rosso. Peso: 4,25 kg. Posti: 150.",
    ].join("\n"),
  );

  it.each([
    ["the source writes once", "impilabile"],
    ["with the punctuation it has in the source", "impilabile."],
    ["in other case", "IMPILABILE"],
    ["as a number written once", "150"],
  ])("finds a word %s", (_case, quote) => {
    expect(isQuoted(readings, quote, "unique")).toBe(true);
  });

  it.each([
    ["the source writes twice", "rosso"],
    ["the source writes twice, in other case", "attributo"],
    ["missing from the source", "impilabili"],
    ["inside a longer word", "anodizza"],
    ["with punctuation the source does not have", "impilabile!"],
  ])("does not find a word %s", (_case, quote) => {
    expect(isQuoted(readings, quote, "unique")).toBe(false);
  });

  it("finds no word at all when one word never counts", () => {
    expect(isQuoted(readings, "impilabile", "never")).toBe(false);
  });

  it("tells a quote of one word from a longer one", () => {
    expect(isOneWord("impilabile.")).toBe(true);
    expect(isOneWord("  ")).toBe(true);
    expect(isOneWord("4,25")).toBe(false);
    expect(isOneWord("Attributo 12")).toBe(false);
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

  it("reads a quote of a Markdown source without its markup", () => {
    const quote =
      "**Grande festa** per la riapertura. Il programma:\n- concerto inaugurale;\n- [visite guidate](https://teatro.it/visite).";

    expect(
      holds(
        quote,
        "Grande festa per la riapertura. Il programma: concerto inaugurale; visite guidate.",
      ),
    ).toBe(true);
    expect(holds(quote, "Grande festa per la chiusura")).toBe(false);
  });
});

describe("writesLink", () => {
  it.each([
    ["with its scheme", "Info su https://teatro.it/biglietti.", true],
    ["at the end of a sentence in brackets", "(teatro.it/biglietti)", true],
    ["with a query", "teatro.it/biglietti?evento=42", false],
    ["with a fragment", "teatro.it/biglietti#posti", false],
    ["with an extension", "teatro.it/biglietti.html", false],
    ["without its scheme", "Info su teatro.it/biglietti", true],
    [
      "as the address of a Markdown link",
      "[qui](https://teatro.it/biglietti)",
      true,
    ],
    ["with a trailing slash", "teatro.it/biglietti/", true],
    ["with a longer path", "teatro.it/biglietti/2027", false],
    ["on another host", "nuovoteatro.it/biglietti", false],
    ["on a subdomain", "www.teatro.it/biglietti", false],
    ["only as an email on its host", "info@teatro.it/biglietti", false],
    ["not at all", "Info alla biglietteria", false],
  ])("finds an address written %s", (_case, quote, written) => {
    expect(writesLink(quote, "https://teatro.it/biglietti")).toBe(written);
  });

  it("finds no host inside a longer one", () => {
    expect(writesLink("teatro.it.example.com", "https://teatro.it")).toBe(
      false,
    );
    expect(writesLink("teatro.it:8443/x", "https://teatro.it")).toBe(false);
  });

  it("finds a host alone, with the slash the browser adds", () => {
    expect(
      writesLink("Info: teatroverdipisa.it.", "https://teatroverdipisa.it/"),
    ).toBe(true);
  });
});

describe("writesDate", () => {
  const october14 = { year: 2026, month: 10, day: 14 };

  it.each([
    ["its day and year, the month in words", "Pisa, 14 ottobre 2026", true],
    ["in English, with an ordinal", "October 14th, 2026", true],
    ["in digits, day first", "il 14/10/2026", true],
    ["in digits, month first", "on 10/14/2026", true],
    ["in German, with the day's dot", "14. Oktober 2026", true],
    ["in Spanish", "el 14 de octubre de 2026", true],
    ["with a short month", "Oct. 14, 2026", true],
    ["year first", "2026-10-14T21:00", true],
    ["without the year", "Embargo fino al 14 ottobre", false],
    ["with another year", "14 ottobre 2025", false],
    ["with another day", "15 ottobre 2026", false],
    ["with another month, in digits", "14/11/2026", false],
    ["with the day only in a time", "ottobre 2026, ore 14:00", false],
    ["with another month in words", "14 novembre 2026", false],
    ["with a word that is no month", "14 posti 2026", false],
    ["with the year in two digits", "14.10.26", false],
  ])("reads a day written %s", (_case, quote, written) => {
    expect(writesDate(quote, october14, { year: true })).toBe(written);
  });

  it("reads no day from digits that could mean two", () => {
    const april3 = { year: 2026, month: 4, day: 3 };

    expect(writesDate("03/04/2026", april3, { year: true })).toBe(false);
    expect(
      writesDate("03/03/2026", { ...april3, month: 3 }, { year: true }),
    ).toBe(true);
  });

  it("does not check the year when told so, unless the quote writes another", () => {
    const anyYear = { year: false };

    expect(writesDate("Embargo fino al 14 ottobre", october14, anyYear)).toBe(
      true,
    );
    expect(writesDate("Embargo fino al 15 ottobre", october14, anyYear)).toBe(
      false,
    );
    expect(writesDate("14.10.26", october14, anyYear)).toBe(true);
    expect(writesDate("14.10.25", october14, anyYear)).toBe(false);
    expect(writesDate("14 ottobre 2025", october14, anyYear)).toBe(false);
  });

  // Found by the review: numbers of the quote that only looked like a day and a year.
  it.each([
    [
      "a number before the month",
      "Fase 1: apertura a ottobre 2026",
      { year: 2026, month: 10, day: 1 },
    ],
    [
      "a count of things",
      "Stagione 2026, 7 sale",
      { year: 2026, month: 10, day: 7 },
    ],
    [
      "two dates joined into a range",
      "Festival 14/10/2026-16/10/2026",
      { year: 2026, month: 3, day: 16 },
    ],
    [
      "digits apart by spaces",
      "03 / 04 / 2026",
      { year: 2026, month: 4, day: 3 },
    ],
    [
      "a year in two digits, in another century",
      "nato il 13.05.45",
      { year: 2045, month: 5, day: 13 },
    ],
  ])("reads no day from %s", (_case, quote, day) => {
    expect(writesDate(quote, day, { year: true })).toBe(false);
  });
});

describe("writesTime", () => {
  const nine = { hours: 21, minutes: 0, seconds: 0 };

  it.each([
    ["with a colon", "alle 21:00", true],
    ["with a dot", "alle 21.00", true],
    ["with h and minutes", "dalle 21h00", true],
    ["as an hour with h alone", "dalle 21h", false],
    ["on the 12-hour clock", "at 9 pm", true],
    ["on the 12-hour clock, with minutes", "at 9:00 p.m.", true],
    ["at another minute", "alle 21:30", false],
    ["at another hour", "alle 20:00", false],
    ["as an hour alone", "alle 21", false],
    ["in the morning, on the 12-hour clock", "at 9 am", false],
    ["only as part of a date", "il 21.10.2026", false],
  ])("reads a time written %s", (_case, quote, written) => {
    expect(writesTime(quote, nine, { bareHours: false })).toBe(written);
  });

  it("reads both ends of a range, and no offset in it", () => {
    const strict = { bareHours: false };

    expect(writesTime("dalle 21:00-23:00", nine, strict)).toBe(true);
    expect(
      writesTime("dalle 21:00-23:00", { ...nine, hours: 23 }, strict),
    ).toBe(true);
  });

  it("reads no time in an offset, a duration or a count of hours", () => {
    const strict = { bareHours: false };

    expect(
      writesTime("alle 21:00 UTC+02:00", { ...nine, hours: 2 }, strict),
    ).toBe(false);
    expect(
      writesTime("alle 21:00 GMT-05:00", { ...nine, hours: 5 }, strict),
    ).toBe(false);
    expect(writesTime("durata 2h", { ...nine, hours: 2 }, strict)).toBe(false);
    expect(
      writesTime("aperto 12h al giorno", { ...nine, hours: 12 }, strict),
    ).toBe(false);
  });

  it("checks the seconds a time has", () => {
    expect(
      writesTime("alle 21:00", { ...nine, seconds: 30 }, { bareHours: false }),
    ).toBe(false);
    expect(
      writesTime(
        "alle 21:00:30",
        { ...nine, seconds: 30 },
        { bareHours: false },
      ),
    ).toBe(true);
  });

  it("reads an hour alone when told so, if nothing else could be the hour", () => {
    const bare = { bareHours: true };

    expect(writesTime("alle 21", nine, bare)).toBe(true);
    expect(writesTime("Sala 3, alle 21", nine, bare)).toBe(false);
    expect(writesTime("alle 9", { ...nine, hours: 9 }, bare)).toBe(false);
    expect(writesTime("alle 21", { ...nine, minutes: 30 }, bare)).toBe(false);
    // Another time written: the number is no hour.
    expect(writesTime("Sala 15 alle 21:00", { ...nine, hours: 15 }, bare)).toBe(
      false,
    );
    expect(writesTime("Sala 15, 9 pm", { ...nine, hours: 15 }, bare)).toBe(
      false,
    );
  });
});

describe("writesDateTime", () => {
  const day = { year: 2026, month: 10, day: 14 };
  const nine = { hours: 21, minutes: 0, seconds: 0 };
  const strict = { year: true, bareHours: false, timeZone: true };

  it("needs the day and the time", () => {
    expect(
      writesDateTime(
        "14 ottobre 2026 alle 21:00",
        day,
        nine,
        undefined,
        strict,
      ),
    ).toBe(true);
    expect(
      writesDateTime(
        "Pisa, 14 ottobre 2026",
        day,
        { hours: 0, minutes: 0, seconds: 0 },
        undefined,
        strict,
      ),
    ).toBe(false);
    expect(writesDateTime("alle 21:00", day, nine, undefined, strict)).toBe(
      false,
    );
  });

  it.each([
    [
      "no offset, for a value without one",
      "14 ottobre 2026 alle 21:00",
      undefined,
      true,
    ],
    [
      "no offset, for a value with one",
      "14 ottobre 2026 alle 21:00",
      120,
      false,
    ],
    ["no offset, for a value in UTC", "14 ottobre 2026 alle 21:00", 0, false],
    ["the value's offset", "2026-10-14T21:00:00+02:00", 120, true],
    ["another offset", "2026-10-14T21:00:00+01:00", 120, false],
    ["Z, for UTC", "2026-10-14T21:00:00Z", 0, true],
    ["UTC with an offset", "14/10/2026, 21:00 UTC+2", 120, true],
    ["GMT", "14/10/2026, 21:00 GMT", 0, true],
    ["GMT with an offset", "14/10/2026, 21:00 GMT+01:00", 60, true],
    ["GMT with an offset, for UTC", "14/10/2026, 21:00 GMT+01:00", 0, false],
    ["an offset glued to the time", "14/10/2026, 21:00+02:00", 120, true],
    ["fractions of a second", "2026-10-14T21:00:00.000Z", 0, true],
    [
      "an offset, for a value without one",
      "2026-10-14T21:00:00+02:00",
      undefined,
      false,
    ],
    [
      "a zone by name, for a value with an offset",
      "14/10/2026, 21:00 CET",
      60,
      false,
    ],
    [
      "a zone by name, for a value without one",
      "14/10/2026, 21:00 CEST",
      undefined,
      false,
    ],
  ])("checks a quote that writes %s", (_case, quote, offset, written) => {
    expect(writesDateTime(quote, day, nine, offset, strict)).toBe(written);
  });

  it("reads a range as no time zone, and an offset as no time", () => {
    expect(
      writesDateTime("14/10/2026, 21:00-23:00", day, nine, undefined, strict),
    ).toBe(true);
    expect(
      writesDateTime(
        "2026-10-14T21:00:00+02:00",
        day,
        { hours: 2, minutes: 0, seconds: 0 },
        120,
        strict,
      ),
    ).toBe(false);
  });

  it("ties a time zone to the time it follows", () => {
    // 21:00 local, said also in UTC: the UTC is 20:00's.
    const both = "14/10/2026 alle 21:00 (20:00 UTC)";

    expect(writesDateTime(both, day, nine, 0, strict)).toBe(false);
    expect(writesDateTime(both, day, nine, undefined, strict)).toBe(true);
    expect(writesDateTime(both, day, { ...nine, hours: 20 }, 0, strict)).toBe(
      true,
    );
    expect(
      writesDateTime(
        "14/10/2026 21:00 UTC+2 (19:00 UTC)",
        day,
        { ...nine, hours: 19 },
        120,
        strict,
      ),
    ).toBe(false);
  });

  it("verifies no time without a zone when the quote writes a zone apart", () => {
    expect(
      writesDateTime(
        "Orari in UTC: 14/10/2026 alle 21:00",
        day,
        nine,
        undefined,
        strict,
      ),
    ).toBe(false);
  });

  it("verifies nothing when the quote writes two days", () => {
    const quote =
      "Prove il 14/10/2026 alle 18:00, prima il 15/10/2026 alle 21:00";

    expect(writesDateTime(quote, day, nine, undefined, strict)).toBe(false);
    expect(
      writesDateTime(
        "14/10/2026 (14 ottobre 2026) alle 21:00",
        day,
        nine,
        undefined,
        strict,
      ),
    ).toBe(true);
  });

  it("leaves the time zone out when told so", () => {
    expect(
      writesDateTime("14 ottobre 2026 alle 21:00", day, nine, 120, {
        ...strict,
        timeZone: false,
      }),
    ).toBe(true);
  });

  it("takes the day and the year of the date out before an hour alone", () => {
    const bare = { ...strict, bareHours: true };
    const fourteen = { hours: 14, minutes: 0, seconds: 0 };

    expect(
      writesDateTime("14 ottobre 2026 alle 21", day, nine, undefined, bare),
    ).toBe(true);
    expect(
      writesDateTime("14 ottobre 2026", day, fourteen, undefined, bare),
    ).toBe(false);
    expect(
      writesDateTime(
        "il 14 ottobre 2026 alle 14",
        day,
        fourteen,
        undefined,
        bare,
      ),
    ).toBe(true);
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

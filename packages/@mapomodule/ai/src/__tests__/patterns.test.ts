import { describe, expect, it } from "vitest";
import {
  MAX_PATTERN_STEPS,
  patternCost,
  patternSteps,
} from "../runtime/shared/patterns";

/** Whether a test of `pattern` on a value of `length` characters may run. */
function runsOn(pattern: string, length: number): boolean {
  return patternSteps(patternCost(pattern), length) <= MAX_PATTERN_STEPS;
}

describe("patternCost — patterns that never run", () => {
  it.each([
    ["a back-reference", "^(a+)\\1$"],
    ["a named back-reference", "^(?<x>a)\\k<x>$"],
    ["a Python named group, which JavaScript cannot read", "^(?P<x>a)$"],
    ["an inline flag", "(?i)abc"],
    ["an unclosed group", "(abc"],
    ["an unclosed class", "[abc"],
    ["a stray closing parenthesis", "abc)"],
    ["nothing to repeat", "+abc"],
  ])("%s: %s", (_case, pattern) => {
    expect(patternCost(pattern).unbounded).toBe(true);
    expect(patternSteps(patternCost(pattern), 1)).toBe(Infinity);
  });

  it("refuses a pattern too long to read", () => {
    expect(patternCost("a".repeat(5001)).unbounded).toBe(true);
    expect(patternCost("a".repeat(5000)).unbounded).toBe(false);
  });

  it("refuses groups nested too deeply", () => {
    expect(patternCost(`${"(".repeat(65)}a${")".repeat(65)}`).unbounded).toBe(
      true,
    );
    expect(patternCost(`${"(".repeat(60)}a${")".repeat(60)}`).unbounded).toBe(
      false,
    );
  });

  it("tells a pattern that starts with ^ in every alternative", () => {
    expect(patternCost("^a|^b").anchored).toBe(true);
    expect(patternCost("^a|b").anchored).toBe(false);
    expect(patternCost("(^a)").anchored).toBe(false);
  });
});

describe("patternSteps — patterns that backtrack without bound", () => {
  it.each([
    ["a repeat of a repeat", "(a+)+$"],
    ["a repeat of a repeat, lazily", "(a*?)*b"],
    ["a repeat of alternatives", "^(a|ab)*c$"],
    ["a repeat of a group with an optional part", "^(ab?)+$"],
    ["a repeat of `u` read without the u flag", "(\\u{1,})+$"],
  ])("%s, %s, does not run on 25 characters", (_case, pattern) => {
    expect(runsOn(pattern, 25)).toBe(false);
  });

  it("does not run a counted repeat of something that can match nothing, past what its rounds allow", () => {
    // `(a?){30}` tries its thirty rounds with or without an `a` each,
    // however short the value: its rounds are not bound by its length.
    expect(runsOn("^(a?){30}a{30}$", 15)).toBe(false);
    expect(runsOn("^(a?){3}$", 3)).toBe(true);
  });

  it("lets a pattern with no bound in general run on a value too short to matter", () => {
    expect(runsOn("(a+)+$", 5)).toBe(true);
  });
});

describe("patternSteps — counted repeats walk the value", () => {
  it.each([
    ["a run of `a` before a long counted run", "a*a{5000}b", 3000],
    ["a long counted run, tried from every position", "a{100000}", 99_990],
    ["a counted run of a counted run", "(?:a{1000}){1000}", 60_000],
    ["a long counted run of any character", "[\\s\\S]{100000}", 60_000],
  ])("does not run %s, %s, on %i characters", (_case, pattern, length) => {
    expect(runsOn(pattern, length)).toBe(false);
  });

  it("counts the length of a literal pattern tried from every position", () => {
    expect(runsOn("a".repeat(5000), 100_000)).toBe(false);
    expect(runsOn("a".repeat(50), 100_000)).toBe(true);
  });
});

describe("patternSteps — the patterns of real schemas", () => {
  it.each([
    ["a slug", "^[-a-zA-Z0-9_]+$", 100_000],
    ["a postcode", "^\\d{5}$", 5],
    ["a country and a number", "^[A-Z]{2}\\d{9}$", 11],
    ["a phone number", "^\\+?\\d{6,15}$", 15],
    ["a list of languages", "^(?:it|en|fr|de|es)$", 2],
    ["a brace that is no repeat", "^a{x}$", 4],
    ["`u` repeated, read without the u flag", "^\\u{2,}$", 100_000],
    ["escapes and classes", "^[\\]a-z(]\\(\\d\\.$", 4],
    ["an address of an email, of normal length", "^\\S+@\\S+\\.\\S+$", 150],
  ])("runs %s, %s, on %i characters", (_case, pattern, length) => {
    expect(runsOn(pattern, length)).toBe(true);
  });

  it("runs a pattern with three repeats only on values short enough for them", () => {
    expect(runsOn("^\\S+@\\S+\\.\\S+$", 150)).toBe(true);
    expect(runsOn("^\\S+@\\S+\\.\\S+$", 200)).toBe(false);
  });

  it("counts every starting position of a pattern with no anchor", () => {
    expect(runsOn("\\d+\\d+x", 150)).toBe(true);
    expect(runsOn("\\d+\\d+x", 200)).toBe(false);
  });

  it("lets one repeat run on values of millions of characters, not beyond", () => {
    expect(runsOn("^[a-z]+$", 4_000_000)).toBe(true);
    expect(runsOn("^[a-z]+$", 6_000_000)).toBe(false);
  });
});

/**
 * What a case of the evaluation holds: a source, the form it fills, what
 * each field should end with, and the answer the mock gives for it.
 */
import type { EvalFormName } from "./forms";

/**
 * The source of a case: a pasted text, or a file as the operator attaches
 * it, read by Mapo's readers into the text `run` takes (a web page, a CSV).
 */
export type EvalSource =
  | { kind: "text"; text: string }
  | { kind: "file"; name: string; content: string };

/**
 * Where a value should go, as the operator meets it: into the form by
 * itself (`in`), waiting for Apply (`waits`), to pick or to set by hand
 * (`by-hand`), or nowhere, since the record holds it already (`held`).
 */
export type EvalGoes = "in" | "waits" | "by-hand" | "held";

/** What a field should end with, after the answer. */
export interface EvalExpected {
  /**
   * The value the field should take, as it saves it: a text, a number, a
   * choice's value, `true`, a date as `YYYY-MM-DD`, a datetime as
   * `YYYY-MM-DDTHH:MM`, a related record's id, a list of ids.
   */
  value?: unknown;
  /** For a long text, or a list of items: words its value must hold, letter case and spaces aside. */
  phrases?: string[];
  /** For a list of items: how many a write would add, those the field holds left out. */
  adds?: number;
  /** The source does not give it: any value is invented. */
  empty?: true;
  /** Where the value should go. Not checked when left out. */
  goes?: EvalGoes;
}

/** A model's answer, as the mock writes it: a fixture of the case. */
export interface EvalMockAnswer {
  values: Record<string, unknown>;
  evidence: { field: string; quote: string; where: string }[];
}

/** A case of the evaluation. */
export interface EvalCase {
  /** Its name, also its fixture's: lowercase letters, digits and `-`. */
  id: string;
  /** What it tries, in a line. */
  title: string;
  form: EvalFormName;
  /** The language the record's translatable values are written in. */
  language: string;
  /** The record as it is before the answer: a case without it fills a new one. */
  record?: Record<string, unknown>;
  source: EvalSource;
  /** The operator's instructions for this source. */
  instructions?: string;
  /** What each field should end with, by its key. A field left out is not scored. */
  expect: Record<string, EvalExpected>;
  /**
   * What the mock answers, mistakes included, so the scoring is checked
   * without a model: an answer written as a model writes it, or a refusal.
   */
  mock: EvalMockAnswer | { refusal: string };
}

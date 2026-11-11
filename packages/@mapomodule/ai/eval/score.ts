/**
 * The report of an evaluation: each field of each case against what it
 * should end with, compared by the kind of its field (R152):
 * - exactly for a choice, a number, a date, a yes or no, a related record
 *   (by its id);
 * - letter case, spaces and a closing stop aside for a short text;
 * - by the phrases it must hold for a long text, and for a list of items,
 *   which also counts the items a write would add.
 * Each field also says whether a quote proves the value and where it goes:
 * into the form by itself, waiting for Apply, to set by hand. The totals
 * sum the cases, with the tokens, the time and the cost; two reports of
 * the same set compare field by field.
 */
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import {
  isItemHeld,
  mapoAiValueText,
  proposalOf,
  readModelValue,
} from "../src/runtime/shared/fill";
import type {
  MapoAiFillAction,
  MapoAiFillEntry,
} from "../src/runtime/shared/fill";
import { isRecord } from "../src/runtime/shared/guards";
import type { EvalExpected, EvalGoes } from "./case";
import { EVAL_FORMS } from "./forms";
import type { EvalRun } from "./run";

/**
 * What a field ended with, against what it should:
 * - `right`: the value, or the emptiness, it should have;
 * - `wrong`: a value other than the one it should have, or a place other
 *   than the one it should go to;
 * - `invented`: a value where the source gives none;
 * - `missing`: no value where the source gives one;
 * - `discarded`: a value the gateway threw away, which never goes in.
 */
export type EvalStatus =
  | "right"
  | "wrong"
  | "invented"
  | "missing"
  | "discarded";

/** Where a value went: where it should go, or nowhere. */
export type EvalPlace = EvalGoes | "discarded" | "empty";

export interface EvalFieldScore {
  key: string;
  status: EvalStatus;
  /** What the field should end with, as a person reads it. */
  expected: string;
  /** What the answer gives it, as a person reads it. */
  got: string;
  /** For a value the AI gave: a quote of the source proves it. */
  verified?: boolean;
  /** Where the value went. */
  goes: EvalPlace;
  /** Where it should go, when the case says. */
  goesExpected?: EvalGoes;
}

export interface EvalCaseScore {
  id: string;
  title: string;
  /** The model answered, refused, or the call failed. */
  answer: "answered" | "refused" | "failed";
  /** Why the call failed, or the model's refusal. */
  note?: string;
  ms: number;
  usage?: { inputTokens: number; outputTokens: number };
  cost?: number;
  fields: EvalFieldScore[];
}

export interface EvalTotals {
  cases: number;
  fields: number;
  right: number;
  wrong: number;
  invented: number;
  missing: number;
  discarded: number;
  /** Values the AI gave, and those a quote of the source proves. */
  given: number;
  verified: number;
  /** Values whose place the cases say, and those that went there. */
  placed: number;
  placedRight: number;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  /** In the currency of the prices; absent without a price. */
  cost?: number;
}

export interface EvalReport {
  format: 1;
  provider: string;
  model: string;
  /** When it ran, as the caller gives it. */
  date: string;
  currency?: string;
  totals: EvalTotals;
  cases: EvalCaseScore[];
}

/** The price of a million tokens, as `mapo.ai.prices` gives a model's. */
export interface EvalPrice {
  input: number;
  output: number;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** How a field's value is compared with what it should be. */
type Kind = "short" | "long" | "exact" | "relation" | "list";

const LONG_TYPES = new Set(["textarea", "editor"]);
const SHORT_TYPES = new Set(["text", "email", "url", "slug"]);
const RELATION_TYPES = new Set(["fks", "m2m"]);

function kindOf(field: AnyFieldDescriptor | undefined): Kind {
  const type = String(field?.type ?? "");
  if (type === "repeater") return "list";
  if (RELATION_TYPES.has(type)) return "relation";
  if (LONG_TYPES.has(type)) return "long";
  if (SHORT_TYPES.has(type)) return "short";
  return "exact";
}

const PLACES: Readonly<Record<MapoAiFillAction, EvalPlace>> = {
  apply: "in",
  confirm: "waits",
  manual: "by-hand",
  unchanged: "held",
  discard: "discarded",
  empty: "empty",
};

/** A text as the comparisons read it: letter case, spaces and a closing stop aside. */
function plain(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?:;,]+$/, "");
}

/** Every text inside a value, as one text: a list's items, their fields. */
function textsOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return value.map(textsOf).join(" ");
  if (isRecord(value)) return Object.values(value).map(textsOf).join(" ");
  return "";
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** The ids of related records, as the field saves them or as records. */
function idsOf(value: unknown): string[] {
  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values
    .map((one) => (isRecord(one) ? one.id : one))
    .filter((id) => id !== undefined && id !== null && id !== "")
    .map(String)
    .sort();
}

/** A value of a choice, a number, a yes or no, a date or a datetime, as the case writes it. */
function isSameExact(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "boolean") return actual === expected;
  if (typeof expected === "number") return Number(actual) === expected;
  const wanted = String(expected);
  const got = String(actual);
  // A datetime is compared to the minute, a date to the day.
  const isDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wanted);
  if (isDateTime) return got.slice(0, 16) === wanted;
  return got === wanted;
}

/** The items a write of a list would add: those the record's list does not hold. */
function itemsAdded(value: unknown, held: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  const own: unknown[] = Array.isArray(held) ? held : [];
  return value.filter((item) => !isItemHeld(item, own));
}

function matches(
  kind: Kind,
  expected: EvalExpected,
  actual: unknown,
  held: unknown,
): boolean {
  if (kind === "list") {
    const added = itemsAdded(actual, held);
    const isCountRight =
      expected.adds === undefined || added.length === expected.adds;
    const text = plain(textsOf(added));
    const hasPhrases = (expected.phrases ?? []).every((phrase) =>
      text.includes(plain(phrase)),
    );
    return isCountRight && hasPhrases;
  }
  if (expected.phrases) {
    const text = plain(textsOf(actual));
    return expected.phrases.every((phrase) => text.includes(plain(phrase)));
  }
  if (!("value" in expected)) return true;
  if (kind === "relation") {
    return idsOf(actual).join(",") === idsOf(expected.value).join(",");
  }
  if (kind === "short" || kind === "long") {
    return plain(String(actual)) === plain(String(expected.value));
  }
  return isSameExact(expected.value, actual);
}

/** What the case says a field should end with, as a person reads it. */
function expectedText(expected: EvalExpected): string {
  if (expected.empty) return "(empty)";
  const parts: string[] = [];
  if ("value" in expected) parts.push(mapoAiValueText(expected.value, 60));
  if (expected.phrases) parts.push(`holds “${expected.phrases.join("”, “")}”`);
  if (expected.adds !== undefined) parts.push(`adds ${expected.adds}`);
  if (!parts.length && expected.goes) parts.push(`(${expected.goes})`);
  return parts.join(", ");
}

function gotText(kind: Kind, actual: unknown, held: unknown): string {
  if (isEmptyValue(actual)) return "(empty)";
  if (kind === "list") {
    const added = itemsAdded(actual, held).length;
    return `${Array.isArray(actual) ? actual.length : 0} items, adds ${added}`;
  }
  if (kind === "relation") return `#${idsOf(actual).join(", #")}`;
  return mapoAiValueText(actual, 60);
}

function scoreField(
  key: string,
  expected: EvalExpected,
  entry: MapoAiFillEntry | undefined,
  field: AnyFieldDescriptor | undefined,
  record: Record<string, unknown>,
): EvalFieldScore {
  const kind = kindOf(field);
  const outcome = entry?.outcome;
  const isDiscarded = outcome?.status === "discarded";
  const actual =
    outcome?.status === "filled"
      ? proposalOf(outcome, entry?.relations)
      : undefined;
  const held = entry ? readModelValue(record, entry.path) : undefined;
  const goes: EvalPlace = entry ? PLACES[entry.action] : "empty";
  const base = {
    key,
    expected: expectedText(expected),
    got: isDiscarded
      ? `(discarded: ${mapoAiValueText(outcome?.proposed, 40)})`
      : gotText(kind, actual, held),
    goes,
    ...(outcome?.status === "filled" ? { verified: outcome.verified } : {}),
    ...(expected.goes ? { goesExpected: expected.goes } : {}),
  };
  const isGivenNothing = isEmptyValue(actual);
  const isPlaceWrong = expected.goes !== undefined && goes !== expected.goes;
  let status: EvalStatus;
  if (isDiscarded) status = "discarded";
  else if (expected.empty) status = isGivenNothing ? "right" : "invented";
  else if (isGivenNothing && goes !== "by-hand") status = "missing";
  else if (isPlaceWrong) status = "wrong";
  else status = matches(kind, expected, actual, held) ? "right" : "wrong";
  return { ...base, status };
}

/** The cost of a call, from the tokens it used and the price of its model. */
export function costOf(
  usage: { inputTokens: number; outputTokens: number },
  price: EvalPrice,
): number {
  const input = (usage.inputTokens / 1_000_000) * price.input;
  const output = (usage.outputTokens / 1_000_000) * price.output;
  return input + output;
}

function scoreCase(run: EvalRun, price: EvalPrice | undefined): EvalCaseScore {
  const { case: evalCase, answer } = run;
  const form = EVAL_FORMS[evalCase.form];
  const response = answer?.response;
  const usage = response?.usage;
  const status: EvalCaseScore["answer"] = !response
    ? "failed"
    : response.status === "answered"
      ? "answered"
      : "refused";
  const note =
    run.error ??
    (response?.status === "refused" ? response.refusal : undefined);
  const record = evalCase.record ?? {};
  const fields = Object.entries(evalCase.expect).map(([key, expected]) =>
    scoreField(
      key,
      expected,
      answer?.entries.find((entry) => entry.key === key),
      form.fields.find((field) => field.key === key),
      record,
    ),
  );
  return {
    id: evalCase.id,
    title: evalCase.title,
    answer: status,
    ...(note ? { note } : {}),
    ms: Math.round(run.ms),
    ...(usage
      ? {
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          },
        }
      : {}),
    ...(usage && price ? { cost: costOf(usage, price) } : {}),
    fields,
  };
}

/**
 * The report of a run of the set: every case scored, and the totals.
 * @param meta The provider, the model and when it ran; the price of the
 *   model, for the costs, and its currency.
 */
export function scoreEvaluation(
  runs: readonly EvalRun[],
  meta: {
    provider: string;
    model: string;
    date: string;
    price?: EvalPrice;
    currency?: string;
  },
): EvalReport {
  const cases = runs.map((run) => scoreCase(run, meta.price));
  const fields = cases.flatMap((one) => one.fields);
  const count = (status: EvalStatus) =>
    fields.filter((field) => field.status === status).length;
  const given = fields.filter((field) => field.verified !== undefined);
  const placed = fields.filter((field) => field.goesExpected !== undefined);
  const sum = (pick: (one: EvalCaseScore) => number) =>
    cases.reduce((total, one) => total + pick(one), 0);
  const totals: EvalTotals = {
    cases: cases.length,
    fields: fields.length,
    right: count("right"),
    wrong: count("wrong"),
    invented: count("invented"),
    missing: count("missing"),
    discarded: count("discarded"),
    given: given.length,
    verified: given.filter((field) => field.verified).length,
    placed: placed.length,
    placedRight: placed.filter((field) => field.goes === field.goesExpected)
      .length,
    inputTokens: sum((one) => one.usage?.inputTokens ?? 0),
    outputTokens: sum((one) => one.usage?.outputTokens ?? 0),
    ms: sum((one) => one.ms),
    ...(meta.price ? { cost: sum((one) => one.cost ?? 0) } : {}),
  };
  return {
    format: 1,
    provider: meta.provider,
    model: meta.model,
    date: meta.date,
    ...(meta.currency ? { currency: meta.currency } : {}),
    totals,
    cases,
  };
}

// ─── Comparing two reports ───────────────────────────────────────────────────

/** A field whose status changed from one report to the next. */
export interface EvalChange {
  case: string;
  key: string;
  before: EvalStatus;
  after: EvalStatus;
}

/** What a report says of each field, as the next one compares it. */
export interface EvalCaseStatuses {
  id: string;
  fields: { key: string; status: EvalStatus }[];
}

const STATUSES: readonly EvalStatus[] = [
  "right",
  "wrong",
  "invented",
  "missing",
  "discarded",
];

function isStatus(value: unknown): value is EvalStatus {
  return STATUSES.some((status) => status === value);
}

/**
 * The statuses of a report written before, read as outside data: the
 * cases and fields it holds that can be read; `undefined` for anything
 * that is no report.
 */
export function readEvalStatuses(
  value: unknown,
): EvalCaseStatuses[] | undefined {
  if (!isRecord(value) || value.format !== 1) return undefined;
  const { cases } = value;
  if (!Array.isArray(cases)) return undefined;
  return cases.flatMap((one: unknown): EvalCaseStatuses[] => {
    if (!isRecord(one) || typeof one.id !== "string") return [];
    const { fields } = one;
    if (!Array.isArray(fields)) return [];
    return [
      {
        id: one.id,
        fields: fields.flatMap((field: unknown) =>
          isRecord(field) &&
          typeof field.key === "string" &&
          isStatus(field.status)
            ? [{ key: field.key, status: field.status }]
            : [],
        ),
      },
    ];
  });
}

/** The fields whose status changed, in the cases both reports hold. */
export function compareReports(
  before: readonly EvalCaseStatuses[],
  after: EvalReport,
): EvalChange[] {
  const changes: EvalChange[] = [];
  for (const now of after.cases) {
    const then = before.find((one) => one.id === now.id);
    if (!then) continue;
    for (const field of now.fields) {
      const old = then.fields.find((one) => one.key === field.key);
      if (old && old.status !== field.status) {
        changes.push({
          case: now.id,
          key: field.key,
          before: old.status,
          after: field.status,
        });
      }
    }
  }
  return changes;
}

// ─── Markdown ────────────────────────────────────────────────────────────────

const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "–";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function money(value: number | undefined, currency: string | undefined) {
  return value === undefined
    ? "–"
    : `${value.toFixed(4)} ${currency ?? ""}`.trim();
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The report as a page to read: the totals, then each case field by field. */
export function renderEvalReport(
  report: EvalReport,
  changes: readonly EvalChange[] = [],
): string {
  const { totals } = report;
  const lines = [
    `# Magic Fill evaluation: ${report.provider} · ${report.model}`,
    "",
    `${report.date} · ${totals.cases} cases, ${totals.fields} fields`,
    "",
    "| Right | Wrong | Invented | Missing | Discarded | Quotes found | Where it should go | Tokens in / out | Time | Cost |",
    "| ----- | ----- | -------- | ------- | --------- | ------------ | ------------------ | --------------- | ---- | ---- |",
    `| ${totals.right} | ${totals.wrong} | ${totals.invented} | ${totals.missing} | ${totals.discarded} | ${totals.verified} of ${totals.given} (${percent(totals.verified, totals.given)}) | ${totals.placedRight} of ${totals.placed} (${percent(totals.placedRight, totals.placed)}) | ${totals.inputTokens} / ${totals.outputTokens} | ${seconds(totals.ms)} | ${money(totals.cost, report.currency)} |`,
  ];
  if (changes.length) {
    lines.push("", "## Changes since the previous report", "");
    lines.push(
      "| Case | Field | Before | Now |",
      "| ---- | ----- | ------ | --- |",
    );
    for (const change of changes) {
      lines.push(
        `| ${change.case} | ${change.key} | ${change.before} | ${change.after} |`,
      );
    }
  }
  for (const one of report.cases) {
    const usage = one.usage
      ? ` · ${one.usage.inputTokens} / ${one.usage.outputTokens} tokens`
      : "";
    lines.push(
      "",
      `## ${one.id}`,
      "",
      one.title,
      "",
      `${one.answer} · ${seconds(one.ms)}${usage}${one.note ? ` · ${cell(one.note)}` : ""}`,
      "",
      "| Field | Expected | Got | Status | Quote | Goes |",
      "| ----- | -------- | --- | ------ | ----- | ---- |",
    );
    for (const field of one.fields) {
      const quote =
        field.verified === undefined
          ? ""
          : field.verified
            ? "found"
            : "not found";
      const goes = field.goesExpected
        ? `${field.goes} (should: ${field.goesExpected})`
        : field.goes;
      lines.push(
        `| ${field.key} | ${cell(field.expected)} | ${cell(field.got)} | ${field.status} | ${quote} | ${goes} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

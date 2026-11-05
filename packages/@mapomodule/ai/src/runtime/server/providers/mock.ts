/**
 * The `mock` provider: answers without a network, a key or a cost, for
 * tests, demos and the reference app. An app enables it as any provider, in
 * `mapo.ai.providers`. It answers in three ways, the first that applies:
 * 1. a failure on command: a mark in the source, such as `#mock:refusal`;
 * 2. a fixture: an answer written by hand for a source, which the app
 *    registers with `registerMapoAiMockFixtures()`; the source names it
 *    (`#mock:fixture=<name>`) or has its very text;
 * 3. simple rules: each line "Label: value" whose label is a field's fills
 *    that field, quoting the line.
 * Its answers go through the sanitizer like any model's.
 */

import type { AiContractEntity, AiContractField } from "../../shared/contract";
import type { MapoAiUsage } from "../../shared/gateway";
import { MapoAiProviderError } from "./types";
import type {
  MapoAiProvider,
  MapoAiProviderAnswer,
  MapoAiProviderRequest,
} from "./types";

/** An answer written by hand for a source. */
export interface MapoAiMockFixture {
  /**
   * Its name: a source that writes `#mock:fixture=<name>` gets this answer.
   * Lowercase letters, digits, `-` and `_`.
   */
  name: string;
  /** A source with this text, case and spaces aside, gets this answer without a mark. */
  source?: string;
  /**
   * The answer, as a model writes it for the request's contract:
   * `{ values, evidence }` to fill a record, `{ items }` to extract them.
   * It goes through the sanitizer like any answer, so it may hold wrong
   * values or quotes on purpose.
   */
  answer?: unknown;
  /** What the mock says instead of answering. */
  refusal?: string;
  /** The tokens to report; estimated from the text otherwise. */
  usage?: Partial<MapoAiUsage>;
}

/** The commands a source can give the mock: `#mock:refusal`, `#mock:slow=5`. */
const MARK = /#mock:([a-z-]+)(?:=([A-Za-z0-9_.-]+))?/g;
const FIXTURE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** How long `#mock:slow` waits without a number, and at most, in seconds. */
const SLOW_SECONDS = 3;
const MAX_SLOW_SECONDS = 600;
/** In how many seconds `#mock:rate-limit` says to try again. */
const RETRY_AFTER_SECONDS = 30;
/** The longest label of a line "Label: value". */
const MAX_LABEL = 80;
const YES = new Set(["yes", "true", "si", "sì", "vero", "1"]);
const NO = new Set(["no", "false", "falso", "0"]);

const fixtures = new Map<
  string,
  { fixture: MapoAiMockFixture; source?: string }
>();

/**
 * Registers answers of the `mock` provider, in a Nitro plugin of the app.
 *
 * @example
 * // server/plugins/mapo-ai-fixtures.ts
 * export default defineNitroPlugin(() => {
 *   registerMapoAiMockFixtures([
 *     {
 *       name: "about-us",
 *       answer: { values: { title: "About us" }, evidence: [{ field: "title", quote: "About us", where: "" }] },
 *     },
 *   ]);
 * });
 * @throws TypeError when a name is not one, or a fixture has neither an
 *   answer nor a refusal, or both; Error when a name is registered already
 */
export function registerMapoAiMockFixtures(
  list: readonly MapoAiMockFixture[],
): void {
  for (const fixture of list) {
    const { name } = fixture;
    if (typeof name !== "string" || !FIXTURE_NAME.test(name)) {
      throw new TypeError(
        `A mock fixture's name is lowercase letters, digits, "-" and "_": ${JSON.stringify(name)}`,
      );
    }
    if (fixtures.has(name)) {
      throw new Error(`The mock fixture "${name}" is registered already`);
    }
    const hasAnswer = Object.hasOwn(fixture, "answer");
    const hasRefusal = typeof fixture.refusal === "string";
    if (hasAnswer === hasRefusal) {
      throw new TypeError(
        `The mock fixture "${name}" needs an answer or a refusal, and not both`,
      );
    }
    fixtures.set(name, {
      fixture,
      ...(typeof fixture.source === "string"
        ? { source: normalized(fixture.source) }
        : {}),
    });
  }
}

/** The `mock` provider. */
export const mockProvider: MapoAiProvider = {
  id: "mock",
  label: "Mock",
  capabilities: {
    structuredOutput: "strict",
    pdf: false,
    images: false,
    streaming: false,
    tools: false,
  },
  models: ["mock"],
  run: runMock,
};

async function runMock(
  request: MapoAiProviderRequest,
): Promise<MapoAiProviderAnswer> {
  const text = request.parts.map((part) => part.text).join("\n\n");
  const marks = marksIn(text);

  if (marks.has("timeout")) return untilAborted(request.signal);
  if (marks.has("rate-limit")) {
    throw new MapoAiProviderError(
      "rate-limit",
      "The mock is rate-limited (#mock:rate-limit)",
      { retryAfter: RETRY_AFTER_SECONDS },
    );
  }
  if (marks.has("unavailable")) {
    throw new MapoAiProviderError(
      "unavailable",
      "The mock is down (#mock:unavailable)",
    );
  }
  if (marks.has("too-long")) {
    throw new MapoAiProviderError(
      "too-long",
      "The source does not fit the mock's context (#mock:too-long)",
    );
  }
  if (marks.has("truncated")) {
    throw new MapoAiProviderError(
      "truncated",
      "The mock's answer reached its cap (#mock:truncated)",
    );
  }
  if (marks.has("slow")) {
    await wait(slowSeconds(marks.get("slow")) * 1000, request.signal);
  }
  if (marks.has("refusal")) {
    return refused(request, "The mock refuses this source (#mock:refusal).");
  }
  if (marks.has("invalid-json")) {
    return answered(request, '{ "values": this is not JSON');
  }

  const named = marks.get("fixture");
  const found = named ? fixtures.get(named) : fixtureOf(text);
  if (named && !found) {
    return refused(request, `The mock has no fixture named "${named}".`);
  }
  if (found) {
    const { fixture } = found;
    return fixture.refusal !== undefined
      ? refused(request, fixture.refusal, fixture.usage)
      : answered(request, fixture.answer, fixture.usage);
  }
  return answered(request, rulesAnswer(request, text));
}

// ─── Failures on command ─────────────────────────────────────────────────────

/** The marks of a source, by name; a mark without a value has `""`. */
function marksIn(text: string): Map<string, string> {
  const marks = new Map<string, string>();
  for (const [, name = "", value = ""] of text.matchAll(MARK)) {
    if (!marks.has(name)) marks.set(name, value);
  }
  return marks;
}

function slowSeconds(value: string | undefined): number {
  const seconds = Number(value);
  const isGiven = value !== undefined && value !== "" && seconds > 0;
  return isGiven ? Math.min(seconds, MAX_SLOW_SECONDS) : SLOW_SECONDS;
}

/** Never answers: rejects when the gateway gives up. */
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The fixture whose source is this text, case and spaces aside. */
function fixtureOf(
  text: string,
): { fixture: MapoAiMockFixture; source?: string } | undefined {
  const key = normalized(text);
  for (const found of fixtures.values()) {
    if (found.source === key) return found;
  }
  return undefined;
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// ─── Answers ─────────────────────────────────────────────────────────────────

function answered(
  request: MapoAiProviderRequest,
  output: unknown,
  usage?: Partial<MapoAiUsage>,
): MapoAiProviderAnswer {
  const written = typeof output === "string" ? output : JSON.stringify(output);
  return {
    status: "answered",
    output,
    usage: usageOf(request, written ?? "", usage),
  };
}

function refused(
  request: MapoAiProviderRequest,
  refusal: string,
  usage?: Partial<MapoAiUsage>,
): MapoAiProviderAnswer {
  return {
    status: "refused",
    refusal,
    usage: usageOf(request, refusal, usage),
  };
}

/** A token is about four characters: what a real model would count, roughly. */
function usageOf(
  request: MapoAiProviderRequest,
  written: string,
  given: Partial<MapoAiUsage> = {},
): MapoAiUsage {
  const read = request.prompt.instructions.length + request.prompt.input.length;
  return {
    inputTokens: given.inputTokens ?? Math.ceil(read / 4),
    outputTokens: given.outputTokens ?? Math.ceil(written.length / 4),
  };
}

// ─── Simple rules ────────────────────────────────────────────────────────────

/** A line "Label: value" of the source. */
interface LabeledLine {
  label: string;
  value: string;
  line: string;
}

/**
 * The answer the rules give: each line "Label: value" whose label is a
 * field's label, key or property name fills that field with the value,
 * quoting the line. An extraction gets an item for each entity with a field
 * so filled.
 */
function rulesAnswer(request: MapoAiProviderRequest, text: string): unknown {
  const lines = labeledLines(text);
  const { contract } = request;
  if (contract.task === "fill")
    return entityAnswer(contract.entity, lines).answer;
  const items = contract.entities.flatMap((entity) => {
    const { answer, filled } = entityAnswer(entity, lines);
    const type = entity.type ?? "";
    return filled ? [{ type, ref: `${type}-1`, ...answer }] : [];
  });
  return { items };
}

function entityAnswer(
  entity: AiContractEntity,
  lines: readonly LabeledLine[],
): { answer: Record<string, unknown>; filled: number } {
  let filled = 0;
  const evidence: unknown[] = [];
  const values = entity.fields.map((field): [string, unknown] => {
    const names = namesOf(field);
    const line = field.items
      ? undefined
      : lines.find((one) => names.has(one.label));
    const value = line ? valueFor(field, line.value) : undefined;
    if (!line || value === undefined) return [field.wire, emptyValue(field)];
    filled++;
    evidence.push({ field: field.wire, quote: line.line, where: "" });
    return [field.wire, value];
  });
  const answer: Record<string, unknown> = {
    values: Object.fromEntries(values),
    ...(entity.evidence ? { evidence } : {}),
  };
  return { answer, filled };
}

/**
 * The lines "Label: value" of a text, read line by line with `indexOf`, so
 * the time grows with the text, whatever it holds.
 */
function labeledLines(text: string): LabeledLine[] {
  const lines: LabeledLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const label = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    const isLabel = label !== "" && label.length <= MAX_LABEL;
    if (!isLabel || value === "") continue;
    lines.push({ label: labelKey(label), value, line });
  }
  return lines;
}

/** The names a line's label may give a field: its label, key and property name. */
function namesOf(field: AiContractField): Set<string> {
  return new Set(
    [field.label, field.key, field.wire]
      .filter((name): name is string => !!name)
      .map(labelKey),
  );
}

/** A label as lines and fields are compared: lowercase, no accents, no `*`. */
function labelKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What the answer writes for a field the source leaves out. */
function emptyValue(field: AiContractField): unknown {
  if (field.items || field.multiple) return [];
  if (field.linksTo) return { record: "", item: "" };
  return "";
}

/** The value a line gives a field, as a model would write it; `undefined` when it gives none. */
function valueFor(field: AiContractField, written: string): unknown {
  const parts = field.multiple
    ? written
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [written.trim()];
  const values = parts.map((part) => elementFor(field, part));
  const given = values.filter((value) => value !== undefined);
  if (!given.length) return undefined;
  return field.multiple ? given : given[0];
}

function elementFor(field: AiContractField, written: string): unknown {
  if (field.linksTo) return { record: written, item: "" };
  if (field.kind === "boolean") {
    const key = labelKey(written);
    if (YES.has(key)) return "true";
    if (NO.has(key)) return "false";
    return undefined;
  }
  const choices = field.choices ?? [];
  const hasChoices = field.kind === "choice" || choices.length > 0;
  if (!hasChoices) return written;
  const key = labelKey(written);
  const choice = choices.find(
    (one) => labelKey(one.label) === key || labelKey(String(one.value)) === key,
  );
  return choice ? String(choice.value) : undefined;
}

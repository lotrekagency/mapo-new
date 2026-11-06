/**
 * The usage of the AI, summed from the audit's records when it is read
 * (R99): the calls of a period by user, by model and by day, the latest
 * ones, and their cost where the app prices the model that answered (R100).
 * Nothing is written per call for it. Days are UTC days, as the records'
 * keys file them. Pure: the records and the clock come from the caller.
 */

import type {
  MapoAiAction,
  MapoAiActionsAnswer,
  MapoAiUsage,
  MapoAiUsageAnswer,
  MapoAiUsageCall,
  MapoAiUsageTotals,
} from "../../shared/gateway";
import type { MapoAiAuditRecord, MapoAiKeyActionRecord } from "../run/audit";
import type { MapoAiRunOptions } from "../run/options";

/** The calls the usage lists one by one, the latest. */
export const RECENT_CALLS = 50;
/** The days a period may last: the longest the audit keeps a record by default is 90. */
export const MAX_USAGE_DAYS = 3650;
/** The days of a period unless the request says otherwise. */
export const DEFAULT_USAGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The days of a period, as a request's `days` writes it: a whole number
 * from 1 to {@link MAX_USAGE_DAYS}, {@link DEFAULT_USAGE_DAYS} when
 * absent; `undefined` for one that cannot be read.
 * @param value the query's value: outside data
 */
export function daysOf(value: unknown): number | undefined {
  if (value === undefined || value === "") return DEFAULT_USAGE_DAYS;
  const text = Array.isArray(value) ? undefined : value;
  if (typeof text !== "string" || !/^\d{1,4}$/.test(text)) return undefined;
  const days = Number(text);
  return days >= 1 && days <= MAX_USAGE_DAYS ? days : undefined;
}

/**
 * The last `days` days up to today, in UTC: `from` and `to` as
 * `YYYY-MM-DD`.
 */
export function periodOf(
  days: number,
  now: number,
): { from: string; to: string } {
  const to = new Date(now).toISOString().slice(0, 10);
  const from = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * The day an audit key files its record under, `YYYY-MM-DD`: the key ends
 * in `YYYY:MM:DD:t<time>-<tail>`, in a user's space (`u:<user>:…`) or in
 * `actions:…`. `undefined` for a key that does not end so.
 */
export function dayOfKey(key: string): string | undefined {
  const parts = key.split(":");
  if (parts.length < 4) return undefined;
  const [year, month, date, time] = parts.slice(-4);
  const isDay =
    /^\d{4}$/.test(year ?? "") &&
    /^\d{2}$/.test(month ?? "") &&
    /^\d{2}$/.test(date ?? "") &&
    (time ?? "").startsWith("t");
  return isDay ? `${year}-${month}-${date}` : undefined;
}

/**
 * The keys of a period, newest first: those filed on `from` or later, by
 * the day and the time their keys write.
 */
export function keysOfPeriod(keys: readonly string[], from: string): string[] {
  return keys
    .filter((key) => (dayOfKey(key) ?? "") >= from)
    .sort((a, b) => (whenOf(a) < whenOf(b) ? 1 : -1));
}

/** The day and time a key writes, as text that sorts by time. */
function whenOf(key: string): string {
  return key.split(":").slice(-4).join(":");
}

/**
 * What a call cost, in the currency of `prices`, from its tokens: the
 * prompt's tokens at the price of their part (read from the cache, written
 * to it, the others), and the answer's. `undefined` for a model the app
 * does not price.
 */
export function costOf(
  provider: string,
  model: string,
  usage: MapoAiUsage,
  prices: MapoAiRunOptions["prices"],
): number | undefined {
  const byModel = Object.hasOwn(prices.providers, provider)
    ? prices.providers[provider]
    : undefined;
  const price =
    byModel && Object.hasOwn(byModel, model) ? byModel[model] : undefined;
  if (!price) return undefined;
  const read = usage.cacheReadTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - read - written);
  const amount =
    fresh * price.input +
    read * (price.cacheRead ?? price.input) +
    written * (price.cacheWrite ?? price.input) +
    usage.outputTokens * price.output;
  return rounded(amount / 1_000_000);
}

/**
 * The usage of `records`, the calls of the period: totals, by user (when
 * `byUser`), by model, by day, and the latest calls.
 * @param records the period's records, newest first
 */
export function usageReport(
  records: readonly MapoAiAuditRecord[],
  options: {
    days: number;
    from: string;
    to: string;
    prices: MapoAiRunOptions["prices"];
    byUser: boolean;
    truncated: boolean;
  },
): MapoAiUsageAnswer {
  const totals = emptyTotals();
  const users = new Map<
    string,
    MapoAiUsageTotals & { user: MapoAiAuditRecord["user"] }
  >();
  const models = new Map<
    string,
    MapoAiUsageTotals & { provider: string; model: string }
  >();
  const days = new Map<string, MapoAiUsageTotals & { day: string }>();
  const recent: MapoAiUsageCall[] = [];

  for (const record of records) {
    const { id: provider, model } = record.provider;
    const cost = costOf(provider, model, record.usage, options.prices);
    const day = record.at.slice(0, 10);
    const user = entryOf(users, record.user.id, () => ({
      ...emptyTotals(),
      user: { ...record.user },
    }));
    const byModel = entryOf(models, `${provider}\u0000${model}`, () => ({
      ...emptyTotals(),
      provider,
      model,
    }));
    const byDay = entryOf(days, day, () => ({ ...emptyTotals(), day }));
    for (const group of [totals, user, byModel, byDay]) {
      add(group, record, cost);
    }
    if (recent.length < RECENT_CALLS) recent.push(callOf(record, cost));
  }

  const byCalls = <T extends MapoAiUsageTotals>(a: T, b: T) =>
    b.calls - a.calls;
  return {
    days: options.days,
    from: options.from,
    to: options.to,
    currency: options.prices.currency,
    totals: finished(totals),
    ...(options.byUser
      ? { byUser: [...users.values()].sort(byCalls).map(finished) }
      : {}),
    byModel: [...models.values()].sort(byCalls).map(finished),
    byDay: [...days.values()]
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .map(finished),
    recent,
    truncated: options.truncated,
  };
}

/** The changes of the period, newest first, as the AI settings list them. */
export function actionsAnswer(
  records: readonly MapoAiKeyActionRecord[],
  options: { days: number; from: string; to: string; truncated: boolean },
): MapoAiActionsAnswer {
  return {
    days: options.days,
    from: options.from,
    to: options.to,
    actions: records.map(actionOf),
    truncated: options.truncated,
  };
}

function actionOf(record: MapoAiKeyActionRecord): MapoAiAction {
  const { v: _version, ...action } = record;
  return {
    ...action,
    by: { ...record.by },
    ...(record.scope ? { scope: { ...record.scope } } : {}),
  };
}

function emptyTotals(): MapoAiUsageTotals {
  return {
    calls: 0,
    answered: 0,
    refused: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    unpricedCalls: 0,
  };
}

function entryOf<T>(map: Map<string, T>, key: string, create: () => T): T {
  const found = map.get(key);
  if (found) return found;
  const made = create();
  map.set(key, made);
  return made;
}

/** Adds one call to a group. */
function add(
  group: MapoAiUsageTotals,
  record: MapoAiAuditRecord,
  cost: number | undefined,
): void {
  group.calls += 1;
  group[record.outcome] += 1;
  group.inputTokens += record.usage.inputTokens;
  group.outputTokens += record.usage.outputTokens;
  group.cacheReadTokens += record.usage.cacheReadTokens ?? 0;
  group.cacheWriteTokens += record.usage.cacheWriteTokens ?? 0;
  if (cost === undefined) group.unpricedCalls += 1;
  else group.cost = rounded((group.cost ?? 0) + cost);
}

/** A group as the answer gives it: no cost when none of its calls is priced. */
function finished<T extends MapoAiUsageTotals>(group: T): T {
  const isPriced = group.unpricedCalls < group.calls;
  if (isPriced) return group;
  const { cost: _cost, ...rest } = group;
  return rest as T;
}

function callOf(
  record: MapoAiAuditRecord,
  cost: number | undefined,
): MapoAiUsageCall {
  return {
    at: record.at,
    user: { ...record.user },
    task: record.task,
    entities: record.entities.flatMap((entity) => {
      const name =
        entity.label ?? entity.type ?? entity.model ?? entity.endpoint;
      return name ? [name] : [];
    }),
    provider: record.provider.id,
    model: record.provider.model,
    ...(record.key ? { key: { ...record.key } } : {}),
    outcome: record.outcome,
    ...(record.failure ? { failure: record.failure } : {}),
    usage: { ...record.usage },
    durationMs: record.durationMs,
    ...(cost !== undefined ? { cost } : {}),
  };
}

/** A cost without the noise of floating point: six decimals. */
function rounded(amount: number): number {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

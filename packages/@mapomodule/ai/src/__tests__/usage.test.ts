import { describe, expect, it } from "vitest";
import type {
  MapoAiAuditRecord,
  MapoAiKeyActionRecord,
} from "../runtime/server/run/audit";
import { readRunOptions } from "../runtime/server/run/options";
import {
  RECENT_CALLS,
  actionsAnswer,
  costOf,
  dayOfKey,
  daysOf,
  keysOfPeriod,
  periodOf,
  usageReport,
} from "../runtime/server/usage/report";
import { readActions, readUsageRecords } from "../runtime/server/usage/read";
import type { PurposeStore } from "../runtime/server/storage/sealed";

const PRICES = {
  currency: "EUR",
  providers: {
    openai: {
      "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
    },
    anthropic: { "claude-haiku-5-5": { input: 1, output: 5 } },
  },
};

function call(
  at: string,
  user: string,
  model: string,
  extra: Partial<MapoAiAuditRecord> = {},
): MapoAiAuditRecord {
  const provider = model.startsWith("gpt") ? "openai" : "anthropic";
  return {
    v: 1,
    at,
    user: { id: user, username: `user-${user}` },
    task: "fill",
    entities: [{ label: "Article", model: "article" }],
    provider: { id: provider, model },
    prompt: 1,
    usage: { inputTokens: 1000, outputTokens: 100 },
    outcome: "answered",
    durationMs: 1200,
    ...extra,
  };
}

describe("the period of the usage", () => {
  it("is the last days up to today, in UTC", () => {
    const now = Date.parse("2026-11-06T23:30:00Z");

    expect(periodOf(1, now)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(periodOf(7, now)).toEqual({ from: "2026-10-31", to: "2026-11-06" });
  });

  it("reads days as a request writes them", () => {
    expect(daysOf(undefined)).toBe(30);
    expect(daysOf("7")).toBe(7);
    expect(daysOf("0")).toBeUndefined();
    expect(daysOf("3651")).toBeUndefined();
    expect(daysOf("7.5")).toBeUndefined();
    expect(daysOf(["7", "30"])).toBeUndefined();
  });

  it("tells the day of a record by its key, and keeps the period's newest first", () => {
    const keys = [
      "u:aa:2026:11:05:t101500000-0001",
      "u:bb:2026:11:06:t090000000-0002",
      "u:aa:2026:10:01:t120000000-0003",
      "u:bb:2026:11:06:t180000000-0004",
      "actions:2026:11:06:t080000000-0005",
      "not-a-record",
    ];

    expect(dayOfKey(keys[0] ?? "")).toBe("2026-11-05");
    expect(dayOfKey("not-a-record")).toBeUndefined();
    expect(keysOfPeriod(keys, "2026-11-05")).toEqual([
      "u:bb:2026:11:06:t180000000-0004",
      "u:bb:2026:11:06:t090000000-0002",
      "actions:2026:11:06:t080000000-0005",
      "u:aa:2026:11:05:t101500000-0001",
    ]);
  });
});

describe("the cost of a call", () => {
  it("prices each part of the prompt as its own, and the answer", () => {
    const cost = costOf(
      "openai",
      "gpt-6.1-sol",
      {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 600_000,
        cacheWriteTokens: 100_000,
      },
      PRICES,
    );

    // 300k fresh × 2 + 600k read × 0.1 + 100k written × 2.5 + 100k out × 10
    expect(cost).toBe(0.6 + 0.06 + 0.25 + 1);
  });

  it("prices the cache's tokens as the prompt's when the app gives no price for them", () => {
    expect(
      costOf(
        "anthropic",
        "claude-haiku-5-5",
        { inputTokens: 2_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 },
        PRICES,
      ),
    ).toBe(2);
  });

  it("has none for a model the app does not price, nor for one of another provider", () => {
    const usage = { inputTokens: 10, outputTokens: 10 };

    expect(costOf("openai", "gpt-6-luna", usage, PRICES)).toBeUndefined();
    expect(costOf("ollama", "gpt-6.1-sol", usage, PRICES)).toBeUndefined();
    expect(costOf("openai", "__proto__", usage, PRICES)).toBeUndefined();
  });
});

describe("the usage of a period", () => {
  const records = [
    call("2026-11-06T18:00:00.000Z", "2", "gpt-6.1-sol", {
      usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400 },
    }),
    call("2026-11-06T09:00:00.000Z", "4", "claude-haiku-5-5", {
      outcome: "failed",
      failure: "timeout",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
    call("2026-11-05T10:00:00.000Z", "2", "claude-opus-5-5", {
      outcome: "refused",
    }),
  ];
  const options = {
    days: 7,
    from: "2026-10-31",
    to: "2026-11-06",
    prices: PRICES,
    byUser: true,
    truncated: false,
  };

  it("sums the calls, their outcomes and tokens, and the cost of the priced ones", () => {
    const usage = usageReport(records, options);

    expect(usage.currency).toBe("EUR");
    expect(usage.totals).toEqual({
      calls: 3,
      answered: 1,
      refused: 1,
      failed: 1,
      inputTokens: 2000,
      outputTokens: 200,
      cacheReadTokens: 400,
      cacheWriteTokens: 0,
      // 600 fresh × 2 + 400 read × 0.1 + 100 out × 10, per million; the
      // failed Haiku call priced at 0; Opus unpriced.
      cost: 0.00224,
      unpricedCalls: 1,
    });
  });

  it("groups by user and model, most calls first, and by day, the latest first", () => {
    const usage = usageReport(records, options);

    expect(usage.byUser?.map((row) => [row.user.id, row.calls])).toEqual([
      ["2", 2],
      ["4", 1],
    ]);
    expect(usage.byModel.map((row) => row.model)).toHaveLength(3);
    expect(usage.byDay.map((row) => [row.day, row.calls])).toEqual([
      ["2026-11-06", 2],
      ["2026-11-05", 1],
    ]);
    // A model the app does not price has no cost at all, not a cost of 0.
    expect(
      usage.byModel.find((row) => row.model === "claude-opus-5-5"),
    ).not.toHaveProperty("cost");
  });

  it("lists the latest calls without what was asked, and leaves the users out for a user's own", () => {
    const usage = usageReport(records, { ...options, byUser: false });

    expect(usage).not.toHaveProperty("byUser");
    expect(usage.recent[0]).toEqual({
      at: "2026-11-06T18:00:00.000Z",
      user: { id: "2", username: "user-2" },
      task: "fill",
      entities: ["Article"],
      provider: "openai",
      model: "gpt-6.1-sol",
      outcome: "answered",
      usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400 },
      durationMs: 1200,
      cost: 0.00224,
    });
    expect(usage.recent[1]?.failure).toBe("timeout");
  });

  it("lists the latest calls up to its limit, but sums them all", () => {
    const many = Array.from({ length: RECENT_CALLS + 5 }, (_, index) =>
      call(
        `2026-11-06T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
        "2",
        "gpt-6-luna",
      ),
    );

    const usage = usageReport(many, options);

    expect(usage.recent).toHaveLength(RECENT_CALLS);
    expect(usage.totals.calls).toBe(RECENT_CALLS + 5);
    expect(usage.totals).not.toHaveProperty("cost");
  });
});

describe("the log of the changes", () => {
  it("answers each change without the record's version", () => {
    const record: MapoAiKeyActionRecord = {
      v: 1,
      at: "2026-11-06T10:00:00.000Z",
      by: { id: "1", username: "admin" },
      action: "settings-saved",
      blocks: ["verification"],
      loosened: ["soleNumber"],
    };

    expect(
      actionsAnswer([record], {
        days: 30,
        from: "2026-10-08",
        to: "2026-11-06",
        truncated: false,
      }).actions,
    ).toEqual([
      {
        at: "2026-11-06T10:00:00.000Z",
        by: { id: "1", username: "admin" },
        action: "settings-saved",
        blocks: ["verification"],
        loosened: ["soleNumber"],
      },
    ]);
  });
});

describe("the app's prices", () => {
  it("reads them by provider and model, and leaves out what it cannot read, with a warning", () => {
    const warnings: string[] = [];
    const { prices } = readRunOptions(
      {
        prices: {
          currency: "eur",
          providers: {
            openai: {
              "gpt-6.1-sol": { input: 2, output: 10 },
              "gpt-6-luna": { input: -1, output: 1 },
              "gpt-x": { input: 1 },
            },
            Bad: {},
          },
        },
      },
      (message) => warnings.push(message),
    );

    expect(prices).toEqual({
      currency: "USD",
      providers: { openai: { "gpt-6.1-sol": { input: 2, output: 10 } } },
    });
    expect(warnings).toHaveLength(4);
    expect(readRunOptions({}, () => undefined).prices).toEqual({
      currency: "USD",
      providers: {},
    });
  });
});

describe("the records of a period, read from the audit", () => {
  /**
   * An audit whose records open only while others are opening too: read
   * one after another, the first never opens and the test fails.
   */
  function auditStore(records: Record<string, MapoAiAuditRecord>) {
    let opening = 0;
    let together = 0;
    const store = {
      keys: async () => Object.keys(records),
      get: async <T>(key: string, read: (value: unknown) => T | undefined) => {
        opening += 1;
        together = Math.max(together, opening);
        await new Promise((resolve) => setTimeout(resolve, 5));
        opening -= 1;
        return read(records[key]);
      },
      forUser: async () => store,
    } as unknown as PurposeStore;
    return { store, together: () => together };
  }

  it("opens the period's records together, newest first, up to its bound", async () => {
    const records = {
      "u:aa:2026:11:06:t100000000-0001": call(
        "2026-11-06T10:00:00.000Z",
        "2",
        "gpt-6-luna",
      ),
      "u:bb:2026:11:06:t120000000-0002": call(
        "2026-11-06T12:00:00.000Z",
        "4",
        "gpt-6-luna",
      ),
      "u:aa:2026:11:05:t090000000-0003": call(
        "2026-11-05T09:00:00.000Z",
        "2",
        "gpt-6-luna",
      ),
      "u:aa:2026:10:01:t090000000-0004": call(
        "2026-10-01T09:00:00.000Z",
        "2",
        "gpt-6-luna",
      ),
    };
    const { store, together } = auditStore(records);

    const read = await readUsageRecords(store, { from: "2026-11-05", max: 2 });

    expect(read.records.map((record) => record.at)).toEqual([
      "2026-11-06T12:00:00.000Z",
      "2026-11-06T10:00:00.000Z",
    ]);
    expect(read.truncated).toBe(true);
    expect(together()).toBeGreaterThan(1);
  });

  it("reads the changes the same way", async () => {
    const { store } = auditStore({});

    await expect(readActions(store, { from: "2026-11-01" })).resolves.toEqual({
      records: [],
      truncated: false,
    });
  });
});

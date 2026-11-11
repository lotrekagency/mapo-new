import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerMapoAiMockFixtures } from "../src/runtime/server/providers/mock";
import type { MapoAiMockFixture } from "../src/runtime/server/providers/mock";
import { EVAL_CASES } from "./cases";
import { estimateEvaluation } from "./estimate";
import { configureNitro } from "./nitro";
import { gatewayPost, runEvalCase } from "./run";
import {
  compareReports,
  readEvalStatuses,
  renderEvalReport,
  scoreEvaluation,
} from "./score";
import type { EvalReport } from "./score";

/**
 * The evaluation set with the mock: every case through the whole chain,
 * the mock answering each with the case's own answer, some of them wrong
 * on purpose. It checks the chain and the scoring, never a model: with a
 * model, `pnpm --filter @mapomodule/ai eval` runs the same cases.
 */

vi.mock("nitropack/runtime", async () =>
  (await import("./nitro")).nitroRuntime(),
);

let report: EvalReport;

beforeAll(async () => {
  configureNitro({ providers: { mock: { timeout: 30 } } });
  registerMapoAiMockFixtures(
    EVAL_CASES.map(
      (one): MapoAiMockFixture =>
        "refusal" in one.mock
          ? { name: one.id, refusal: one.mock.refusal }
          : { name: one.id, answer: one.mock },
    ),
  );
  const post = await gatewayPost();
  const runs = [];
  for (const one of EVAL_CASES) {
    runs.push(await runEvalCase(one, { post, mock: true }));
  }
  report = scoreEvaluation(runs, {
    provider: "mock",
    model: "mock",
    date: "2026-11-11",
    price: { input: 1, output: 2 },
    currency: "USD",
  });
});

describe("the evaluation set", () => {
  it("has fifteen cases with names the mock takes, each scoring some fields", () => {
    const ids = EVAL_CASES.map((one) => one.id);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(ids.length);
    for (const one of EVAL_CASES) {
      expect(one.id).toMatch(/^[a-z0-9-]+$/);
      expect(Object.keys(one.expect).length).toBeGreaterThan(0);
    }
  });

  it("goes through the whole chain with the mock: every case answered", () => {
    expect(
      report.cases.map((one) => [one.id, one.answer, one.note ?? ""]),
    ).toEqual(EVAL_CASES.map((one) => [one.id, "answered", ""]));
  });

  it("scores each field as the mock's answers deserve", () => {
    const table = report.cases.map((one) => ({
      case: one.id,
      fields: Object.fromEntries(
        one.fields.map((field) => [
          field.key,
          `${field.status} · ${field.goes}${field.verified === undefined ? "" : field.verified ? " · quoted" : " · not quoted"}`,
        ]),
      ),
    }));
    expect(table).toMatchSnapshot();
  });

  it("counts the mock's mistakes, the tokens and the cost", () => {
    const { totals } = report;
    expect(totals.cases).toBe(15);
    expect(totals.invented).toBeGreaterThanOrEqual(4);
    expect(totals.wrong).toBeGreaterThanOrEqual(2);
    expect(totals.discarded).toBeGreaterThanOrEqual(1);
    expect(totals.right).toBeGreaterThan(totals.fields / 2);
    expect(totals.inputTokens).toBeGreaterThan(0);
    expect(totals.cost).toBeGreaterThan(0);
  });

  it("writes the report as a page, case by case", () => {
    const page = renderEvalReport(report);
    expect(page).toContain("# Magic Fill evaluation: mock · mock");
    expect(page).toContain("## press-release");
    expect(page).toContain("| category | (empty) | #1 | invented |");
  });

  it("compares a report with one written before, field by field", () => {
    const before = readEvalStatuses(JSON.parse(JSON.stringify(report)));
    const changed = structuredClone(report);
    const [first] = changed.cases;
    if (!first?.fields[0]) throw new Error("No field to change");
    first.fields[0] = { ...first.fields[0], status: "missing" };

    expect(readEvalStatuses({ format: 2 })).toBeUndefined();
    expect(compareReports(before ?? [], changed)).toEqual([
      {
        case: first.id,
        key: first.fields[0].key,
        before: report.cases[0]?.fields[0]?.status,
        after: "missing",
      },
    ]);
  });

  it("estimates what a run would cost before it runs", async () => {
    const estimate = await estimateEvaluation(EVAL_CASES, {
      input: 2.5,
      output: 10,
    });
    expect(estimate.cases).toBe(15);
    expect(estimate.inputTokens).toBeGreaterThan(15_000);
    expect(estimate.cost).toBeGreaterThan(0);
  });
});

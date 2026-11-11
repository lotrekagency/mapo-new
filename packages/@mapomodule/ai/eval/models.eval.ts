import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, vi } from "vitest";
import { providerKeyVariable } from "../src/runtime/server/run/options";
import { EVAL_CASES } from "./cases";
import { estimateEvaluation } from "./estimate";
import { configureNitro } from "./nitro";
import { gatewayPost, runEvalCase } from "./run";
import type { EvalRun } from "./run";
import {
  compareReports,
  readEvalStatuses,
  renderEvalReport,
  scoreEvaluation,
} from "./score";
import type { EvalPrice } from "./score";

/**
 * The evaluation set with a model: `pnpm --filter @mapomodule/ai eval`,
 * with the provider and the model in the environment. It first prints what
 * a run would cost, and runs only with `MAPO_AI_EVAL_RUN=yes`; then it
 * writes the report in `eval/reports/`, as JSON and as a page, compared
 * with an earlier one when `MAPO_AI_EVAL_COMPARE` names it.
 *
 * MAPO_AI_EVAL_PROVIDER   openai, anthropic, ollama or openai-compatible
 * MAPO_AI_EVAL_MODEL      the model, as the provider names it
 * MAPO_AI_EVAL_BASE_URL   the server of ollama or openai-compatible
 * MAPO_AI_EVAL_PRICE      the price of a million tokens: {"input":2.5,"output":10}
 * MAPO_AI_EVAL_CURRENCY   the currency of the price; USD by default
 * MAPO_AI_EVAL_RUN        yes, to run after the estimate
 * MAPO_AI_EVAL_COMPARE    the JSON report of an earlier run
 *
 * The key is the provider's, as an app reads it:
 * NUXT_MAPO_AI_PROVIDERS_<PROVIDER>_API_KEY. It never leaves the provider's
 * request: the report and the output name the provider and the model only.
 */

vi.mock("nitropack/runtime", async () =>
  (await import("./nitro")).nitroRuntime(),
);

const env = process.env;
const PROVIDER = env.MAPO_AI_EVAL_PROVIDER?.trim() ?? "";
const MODEL = env.MAPO_AI_EVAL_MODEL?.trim() ?? "";
const LOCAL = new Set(["ollama", "openai-compatible"]);

/** The price of the model, read from the environment as outside data. */
function priceOf(text: string | undefined): EvalPrice | undefined {
  if (!text) return undefined;
  const value: unknown = JSON.parse(text);
  const isPrice =
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "input") === "number" &&
    typeof Reflect.get(value, "output") === "number";
  if (!isPrice) {
    throw new Error('MAPO_AI_EVAL_PRICE is {"input":…,"output":…}');
  }
  return {
    input: Number(Reflect.get(value, "input")),
    output: Number(Reflect.get(value, "output")),
  };
}

/** The provider's entry of `mapo.ai.providers`, with its key where it has one. */
function providerOptions(): Record<string, unknown> {
  const apiKey = env[providerKeyVariable(PROVIDER)];
  const baseURL = env.MAPO_AI_EVAL_BASE_URL?.trim();
  return {
    models: [MODEL],
    timeout: LOCAL.has(PROVIDER) ? 600 : 300,
    ...(baseURL ? { baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}

const reports = fileURLToPath(new URL("./reports/", import.meta.url));

/** A line for the person who runs it: vitest keeps a passing test's console to itself. */
function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

describe.skipIf(!PROVIDER || !MODEL)("the evaluation set with a model", () => {
  it("prints the estimate, and runs every case with MAPO_AI_EVAL_RUN=yes", async () => {
    const price = LOCAL.has(PROVIDER)
      ? { input: 0, output: 0 }
      : priceOf(env.MAPO_AI_EVAL_PRICE);
    const currency = env.MAPO_AI_EVAL_CURRENCY?.trim() || "USD";
    const estimate = await estimateEvaluation(EVAL_CASES, price);
    const cost =
      estimate.cost === undefined
        ? "no price given (MAPO_AI_EVAL_PRICE)"
        : `about ${estimate.cost.toFixed(4)} ${currency}`;
    say(
      `${PROVIDER} · ${MODEL}: ${estimate.cases} cases, about ${estimate.inputTokens} tokens in and ${estimate.outputTokens} out, ${cost}. A model that reasons writes more.`,
    );
    if (env.MAPO_AI_EVAL_RUN !== "yes") {
      say("Nothing was sent: MAPO_AI_EVAL_RUN=yes runs it.");
      return;
    }

    configureNitro({
      providers: { [PROVIDER]: providerOptions() },
      default: { provider: PROVIDER, models: { fill: MODEL, extract: MODEL } },
    });
    const post = await gatewayPost();
    const runs: EvalRun[] = [];
    for (const one of EVAL_CASES) {
      const run = await runEvalCase(one, { post, mock: false });
      say(
        `${one.id}: ${run.error ?? run.answer?.response.status ?? "?"} in ${(run.ms / 1000).toFixed(1)} s`,
      );
      runs.push(run);
    }
    const date = new Date().toISOString();
    const report = scoreEvaluation(runs, {
      provider: PROVIDER,
      model: MODEL,
      date,
      ...(price ? { price, currency } : {}),
    });
    const earlier = env.MAPO_AI_EVAL_COMPARE
      ? readEvalStatuses(
          JSON.parse(readFileSync(env.MAPO_AI_EVAL_COMPARE, "utf8")),
        )
      : undefined;
    const changes = earlier ? compareReports(earlier, report) : [];
    const name =
      `${date.slice(0, 19).replace(/[:T]/g, "-")}-${PROVIDER}-${MODEL}`.replace(
        /[^\w.-]+/g,
        "_",
      );
    mkdirSync(reports, { recursive: true });
    writeFileSync(
      `${reports}${name}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
    );
    writeFileSync(`${reports}${name}.md`, renderEvalReport(report, changes));
    const { totals } = report;
    say(
      `Right ${totals.right}, wrong ${totals.wrong}, invented ${totals.invented}, missing ${totals.missing}, discarded ${totals.discarded} of ${totals.fields} fields. Report: eval/reports/${name}.md`,
    );
  }, 3_600_000);
});

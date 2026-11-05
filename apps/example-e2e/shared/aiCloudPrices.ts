// The prices of the cloud models the AI lab offers (app/pages/ai/cloud/),
// to estimate what a call cost from the tokens the gateway answers with.
// An estimate for the lab only: prices change, and some depend on the
// account (a European data residency, a tier). These are the providers'
// list prices in dollars per million tokens, read on AI_CLOUD_PRICES_DATE.
import type { MapoAiUsage } from "mapomodule/types";

/** The price of a model's tokens, in dollars per million. */
interface ModelPrice {
  input: number;
  output: number;
  /** Tokens read from the prompt cache. */
  cacheRead: number;
  /** Tokens written to the prompt cache, for its shortest time. */
  cacheWrite: number;
}

/** The day the prices were read. */
export const AI_CLOUD_PRICES_DATE = "2026-11-05";

/**
 * The models of `openai` and `anthropic`, Mapo's defaults first, and those
 * Anthropic may fall back on when its safety filters decline a request.
 */
const PRICES: Record<string, ModelPrice> = {
  "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "gpt-6.1-terra": { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25 },
  "gpt-6-astra": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

/**
 * What a call cost, in dollars, from its tokens: the prompt at the price of
 * each part (read from the cache, written to it, the rest), and the answer
 * with its reasoning. `undefined` for a model the table does not have.
 */
export function estimateAiCost(
  model: string,
  usage: MapoAiUsage,
): number | undefined {
  const price = PRICES[model];
  if (!price) return undefined;
  const read = usage.cacheReadTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - read - written);
  const dollars =
    fresh * price.input +
    read * price.cacheRead +
    written * price.cacheWrite +
    usage.outputTokens * price.output;
  return dollars / 1_000_000;
}

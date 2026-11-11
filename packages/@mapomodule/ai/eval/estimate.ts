/**
 * What a run of the evaluation would cost, before it runs: no provider is
 * called, and the numbers are rough, on purpose a little high.
 */
import { baseRules } from "../src/runtime/server/prompts/base";
import { mapoAiFillRequest } from "../src/runtime/shared/fill";
import type { EvalCase } from "./case";
import { EVAL_FORMS } from "./forms";
import { sourcePartsOf } from "./run";
import { costOf } from "./score";
import type { EvalPrice } from "./score";

/** Characters a token holds, about, in an English or an Italian prompt. */
const CHARS_PER_TOKEN = 4;

export interface EvalEstimate {
  cases: number;
  inputTokens: number;
  outputTokens: number;
  /** In the currency of the price; absent without one. */
  cost?: number;
}

/**
 * The tokens of every case and their cost at the model's price: each
 * request as Mapo's rules, the form's fields twice (in the prompt and in
 * the schema of the answer) and the source, a token every four characters;
 * each answer as long as the mock's, and a fifth more. A model that
 * reasons writes more than it answers, and costs more than this says.
 */
export async function estimateEvaluation(
  cases: readonly EvalCase[],
  price?: EvalPrice,
): Promise<EvalEstimate> {
  let inputChars = 0;
  let outputChars = 0;
  for (const evalCase of cases) {
    const form = EVAL_FORMS[evalCase.form];
    const request = mapoAiFillRequest({
      fields: form.fields,
      source: await sourcePartsOf(evalCase.source),
      language: evalCase.language,
      ...(evalCase.instructions ? { instructions: evalCase.instructions } : {}),
    });
    const fields = JSON.stringify(request.entity.fields ?? {}).length;
    inputChars +=
      baseRules("fill").length + JSON.stringify(request).length + fields;
    outputChars += JSON.stringify(evalCase.mock).length * 1.2;
  }
  const usage = {
    inputTokens: Math.ceil(inputChars / CHARS_PER_TOKEN),
    outputTokens: Math.ceil(outputChars / CHARS_PER_TOKEN),
  };
  return {
    cases: cases.length,
    ...usage,
    ...(price ? { cost: costOf(usage, price) } : {}),
  };
}

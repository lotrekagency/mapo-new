// A provider of the app that calls a local Ollama: how an app registers a
// provider of its own ("Your own provider" in docs/modules/ai.md), used by
// the AI lab, app/pages/ai/ollama/[id].vue. Off unless the dev server
// starts with EXAMPLE_OLLAMA_MODELS, the models to offer, the first the
// default:
//   EXAMPLE_OLLAMA_MODELS=gemma4:12b,qwen3.8:27b pnpm dev:example-e2e
// nuxt.config.ts enables it in mapo.ai.providers from the same variable;
// EXAMPLE_OLLAMA_URL changes Ollama's address. Every call is traced
// (server/utils/aiLab.ts): in the terminal, and in the lab's page.
// Mapo's own provider, `ollama`, calls the same Ollama: the lab's page offers
// both, to compare them. This one also traces each call for the page.
import {
  aiLabModels,
  finishAiLabTrace,
  keepAiLabPrompt,
  startAiLabTrace,
  traceAiLab,
  writeAiLab,
} from "../utils/aiLab";

const OLLAMA = process.env.EXAMPLE_OLLAMA_URL ?? "http://localhost:11434";
/** Characters per token, on the low side: JSON is made of short tokens. */
const CHARS_PER_TOKEN = 3;
/** The least context of a call: enough for the article form. */
const MIN_CONTEXT_TOKENS = 16_384;
/** The most context the lab asks a model for. */
const MAX_CONTEXT_TOKENS = 32_768;
/** The least an answer may take: the article's takes under 700 tokens. */
const MIN_ANSWER_TOKENS = 4096;
/** How often the terminal says how far the model has written. */
const PROGRESS_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function seconds(nanoseconds: unknown): string {
  return (count(nanoseconds) / 1e9).toFixed(1);
}

/**
 * The tokens a call may read and write, from the size of what it sends. The
 * answer repeats the keys of the answer's schema with their values and
 * quotes, so its cap grows with the schema: the block page's answer is not
 * cut, and a model that loops inside a string value, which every value of
 * the schema is, still stops. The context holds the prompt, with the schema
 * in it, and the answer.
 */
function budgetOf(promptChars: number, schemaChars: number) {
  const answer = Math.max(
    MIN_ANSWER_TOKENS,
    Math.ceil(schemaChars / CHARS_PER_TOKEN),
  );
  const read = Math.ceil(promptChars / CHARS_PER_TOKEN);
  // A multiple of 4096, as Ollama's own sizes are.
  const needed = Math.ceil((read + answer) / 4096) * 4096;
  const context = Math.min(
    MAX_CONTEXT_TOKENS,
    Math.max(MIN_CONTEXT_TOKENS, needed),
  );
  return { context, answer };
}

/** The failure of a call that got no answer: given up by the gateway, or Ollama not there. */
function failureOf(error: unknown, signal: AbortSignal) {
  const cause = isRecord(error) && isRecord(error.cause) ? error.cause : {};
  const isTimedOut = signal.aborted || String(cause.code).includes("TIMEOUT");
  traceAiLab(
    "ollama",
    isTimedOut ? "no answer in time" : `cannot be reached at ${OLLAMA}`,
  );
  finishAiLabTrace();
  return isTimedOut
    ? new MapoAiProviderError("timeout", "Ollama did not answer in time", {
        cause: error,
      })
    : new MapoAiProviderError(
        "unavailable",
        `Ollama cannot be reached at ${OLLAMA}`,
        { cause: error },
      );
}

export default defineNitroPlugin((nitroApp) => {
  const models = aiLabModels();
  if (!models.length) return;

  // Called once the gateway let a request of `run` in: the session, the
  // app's rules, the body, the provider, the permission and the limit
  // passed, and the contract is built. A request refused before never
  // reaches it.
  nitroApp.hooks.hook("mapo-ai:prompt", (context) => {
    const names = context.entities
      .map((entity) => entity.label ?? entity.type ?? "a record")
      .join(", ");
    const user = context.user.username ?? context.user.id;
    startAiLabTrace(
      `let ${user} in (session, the app's rules, body, provider, permission and limit passed), and built what the AI may fill: ${context.task} of ${names}`,
    );
  });

  registerMapoAiProvider({
    id: "example-ollama",
    label: "Ollama (example app)",
    capabilities: {
      structuredOutput: "strict",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    models,
    async run(request) {
      const { contract } = request;
      const fields =
        contract.task === "fill"
          ? contract.entity.fields.length
          : contract.entities.reduce(
              (all, entity) => all + entity.fields.length,
              0,
            );
      traceAiLab(
        "gateway",
        `composed the prompt (Mapo's rules v${request.prompt.version}, the app's, the record, then the source: ${request.prompt.instructions.length} + ${request.prompt.input.length} characters) and the answer's schema (${fields} fields)`,
      );
      keepAiLabPrompt(request.prompt);
      // Ollama constrains the answer to `format`, but does not show the
      // schema to the model: its docs advise to pass it in the prompt too
      // (docs.ollama.com/capabilities/structured-outputs). Without it the
      // model never reads the descriptions of the fields: what each holds,
      // the limits, the templates of a list's items.
      const schema = JSON.stringify(request.schema);
      const system = `${request.prompt.instructions}\n\n# The answer's JSON schema\n${schema}`;
      traceAiLab(
        "provider",
        `adds the answer's schema (${schema.length} characters) to the prompt, as Ollama's docs advise: Ollama holds the answer to it, but does not show it to the model`,
      );
      const budget = budgetOf(
        system.length + request.prompt.input.length,
        schema.length,
      );
      traceAiLab(
        "provider",
        `asks ${request.model} at ${OLLAMA}/api/chat: streamed, temperature 0, context ${budget.context} tokens, at most ${budget.answer} written`,
      );

      // Ollama's native API: the only one that takes the context size per
      // call, and `format` constrains the answer to the contract's schema.
      // Streamed, so the headers arrive at once and the lab sees the answer
      // grow; the gateway's `timeout` stops the call.
      const body = {
        model: request.model,
        stream: true,
        think: false,
        format: request.schema,
        options: {
          temperature: 0,
          num_ctx: budget.context,
          num_predict: budget.answer,
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: request.prompt.input },
        ],
      };
      const asked = Date.now();
      let response: Response;
      try {
        response = await fetch(`${OLLAMA}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (error) {
        throw failureOf(error, request.signal);
      }
      if (!response.ok || !response.body) {
        const reason = (await response.text()).slice(0, 200);
        traceAiLab("ollama", `answered ${response.status}: ${reason}`);
        finishAiLabTrace();
        throw new MapoAiProviderError(
          "unavailable",
          `Ollama answered ${response.status}: ${reason}`,
        );
      }

      // One JSON object per line: a piece of the answer each, and a last one
      // with the counts and why the model stopped.
      let text = "";
      let pieces = 0;
      let lastProgress = asked;
      let reply: Record<string, unknown> = {};
      let pending = "";
      const decoder = new TextDecoder();
      try {
        for await (const chunk of response.body) {
          pending += decoder.decode(chunk, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const piece: unknown = JSON.parse(line);
            if (!isRecord(piece)) continue;
            const message = isRecord(piece.message) ? piece.message : {};
            const content =
              typeof message.content === "string" ? message.content : "";
            if (content) {
              if (!pieces) {
                traceAiLab(
                  "ollama",
                  `writes the first words after ${((Date.now() - asked) / 1000).toFixed(1)} s`,
                );
              }
              pieces += 1;
              text += content;
              writeAiLab(content);
            }
            if (piece.done === true) reply = piece;
          }
          if (Date.now() - lastProgress >= PROGRESS_MS) {
            lastProgress = Date.now();
            console.log(
              `[ai-lab] … ${pieces} pieces written so far, ${text.length} characters`,
            );
          }
        }
      } catch (error) {
        throw failureOf(error, request.signal);
      }

      const stopped =
        reply.done_reason === "length"
          ? `stopped at the cap of ${budget.answer} tokens: the answer is cut`
          : "finished";
      traceAiLab(
        "ollama",
        `${stopped}: read ${count(reply.prompt_eval_count)} tokens and wrote ${count(reply.eval_count)}, in ${seconds(reply.total_duration)} s (the model loaded in ${seconds(reply.load_duration)} s)`,
      );
      // The answer as the model wrote it: JSON when it is, the text itself
      // otherwise, which the gateway's sanitizer reads as unreadable.
      let output: unknown = text;
      try {
        output = JSON.parse(text);
      } catch {
        traceAiLab(
          "provider",
          "the answer is not JSON: the gateway will read it as unreadable",
        );
      }
      traceAiLab(
        "provider",
        "hands the answer back: the gateway now audits the call (metadata only, sealed), reads the answer with the sanitizer and sends each field's outcome to the browser",
      );
      finishAiLabTrace();
      return {
        status: "answered",
        output,
        usage: {
          inputTokens: count(reply.prompt_eval_count),
          outputTokens: count(reply.eval_count),
        },
      };
    },
  });

  console.log(
    `[ai-lab] Ollama at ${OLLAMA}, models ${models.join(", ")}: open /ai/ollama/new`,
  );
});

// The AI lab of the reference app (app/pages/ai/ollama/[id].vue): a trace
// of what the gateway and the app's Ollama provider do for the last call of
// `run`, printed in the terminal as it happens and read by the page from
// /_ai-lab/trace. Off unless the dev server starts with
// EXAMPLE_OLLAMA_MODELS. One trace for the whole server: the last call,
// whoever made it.

/** The models of the lab, from EXAMPLE_OLLAMA_MODELS, the first the default; none when it is off. */
export function aiLabModels(): string[] {
  return (process.env.EXAMPLE_OLLAMA_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

/** One step of a call. */
export interface AiLabEntry {
  /** Milliseconds since the call started. */
  at: number;
  /** Who took the step. */
  who: "gateway" | "provider" | "ollama";
  text: string;
}

/** What happened in the last call of `run` through the lab's provider. */
export interface AiLabTrace {
  /** A new number for each call. */
  id: number;
  startedAt: string;
  entries: AiLabEntry[];
  /** The prompt the gateway composed, as the provider received it. */
  prompt?: { version: number; instructions: string; input: string };
  /** What the model has written so far. */
  written: string;
  /** The model has finished, or the call failed. */
  done: boolean;
}

let trace: AiLabTrace | undefined;
let started = 0;
let lastId = 0;

/** Starts the trace of a new call, with its first step. */
export function startAiLabTrace(text: string): void {
  lastId += 1;
  started = Date.now();
  trace = {
    id: lastId,
    startedAt: new Date(started).toISOString(),
    entries: [],
    written: "",
    done: false,
  };
  console.log(`[ai-lab] ─── call ${lastId} ───`);
  traceAiLab("gateway", text);
}

/** Adds a step to the trace of the call, and prints it in the terminal. */
export function traceAiLab(who: AiLabEntry["who"], text: string): void {
  if (!trace) startAiLabTrace("a call the gateway let in");
  const at = Date.now() - started;
  trace?.entries.push({ at, who, text });
  console.log(`[ai-lab] +${(at / 1000).toFixed(1)}s ${who}: ${text}`);
}

/** Keeps the prompt of the call, for the page, and prints it in the terminal. */
export function keepAiLabPrompt(prompt: {
  version: number;
  instructions: string;
  input: string;
}): void {
  if (trace) trace.prompt = { ...prompt };
  console.log(
    `[ai-lab] the prompt, first part:\n${prompt.instructions}\n[ai-lab] the prompt, second part:\n${prompt.input}`,
  );
}

/** Adds what the model wrote since the last piece. */
export function writeAiLab(piece: string): void {
  if (trace) trace.written += piece;
}

/** Marks the call as over, and prints what the model wrote. */
export function finishAiLabTrace(): void {
  if (!trace) return;
  trace.done = true;
  console.log(`[ai-lab] what the model wrote:\n${trace.written}`);
}

/** The trace of the last call; `undefined` before the first. */
export function aiLabTrace(): AiLabTrace | undefined {
  return trace;
}

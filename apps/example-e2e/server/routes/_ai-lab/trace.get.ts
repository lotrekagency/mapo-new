import { createError, defineEventHandler, setResponseHeader } from "h3";
import { aiLabModels, aiLabTrace } from "../../utils/aiLab";
import { requireUser } from "../../utils/session";

/**
 * GET /_ai-lab/trace: the trace of the last call of `run` through the app's
 * Ollama provider, for the AI lab page (app/pages/ai/ollama/[id].vue). Only
 * while the lab is on (EXAMPLE_OLLAMA_MODELS), and only for a superuser:
 * it holds the prompt and what the model wrote, for whoever made the call.
 * Outside `/api`, which is the mock backend, and outside `/_mapo/ai`, which
 * is Mapo's gateway.
 */
export default defineEventHandler((event) => {
  if (!aiLabModels().length) {
    throw createError({ statusCode: 404, statusMessage: "The AI lab is off" });
  }
  const user = requireUser(event);
  const isSuperuser = "is_superuser" in user && user.is_superuser === true;
  if (!isSuperuser) {
    throw createError({
      statusCode: 403,
      statusMessage: "The AI lab's trace is for superusers",
    });
  }
  setResponseHeader(event, "cache-control", "no-store");
  return aiLabTrace() ?? null;
});

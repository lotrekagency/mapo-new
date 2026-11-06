import { createError, defineEventHandler, setResponseHeader } from "h3";
import { z } from "zod";
import type { MapoAiTestResponse } from "../../shared/gateway";
import { requireMapoAiSession } from "../auth/nitro";
import { readJsonBody } from "../body";
import { createRateLimiter } from "../run/limiter";
import { mapoAiUserPolicy } from "../run/nitro";
import { checkConnection } from "../settings/connection";

/** Checks one user may ask in a minute: each one calls the provider's server. */
const CHECKS_PER_MINUTE = 10;
const limiter = createRateLimiter();

const INPUT = z.strictObject({
  provider: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  model: z.string().min(1).max(200).optional(),
});

/**
 * `POST /_mapo/ai/test`: "check the connection" of the AI settings. For a
 * provider the user may call, it asks the provider's server for its models
 * with the key the user's calls use, which costs no tokens, and answers
 * whether the server answered, whether it has the model (the user's
 * default for the provider unless the body names one), and how long it
 * took. Never a key, and never the server's message, which goes to the
 * log. 403 for a provider or a model the user is not given; 429 past ten
 * checks a minute.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiTestResponse> => {
    setResponseHeader(event, "cache-control", "no-store");
    const session = await requireMapoAiSession(event);
    const parsed = INPUT.safeParse(await readJsonBody(event, 4096));
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a check of a provider",
      });
    }
    const { provider: id, model: asked } = parsed.data;
    const policy = await mapoAiUserPolicy(event, session.user);
    const usable = policy.providers.find((one) => one.provider.id === id);
    if (!usable) {
      throw createError({
        statusCode: 403,
        statusMessage: "This AI provider is not enabled",
      });
    }
    const isDefault = policy.defaults?.provider === id;
    const model =
      asked ??
      (isDefault ? policy.defaults?.models.fill : undefined) ??
      usable.models[0];
    if (model === undefined || !usable.models.includes(model)) {
      throw createError({
        statusCode: 403,
        statusMessage: "This AI model is not enabled",
      });
    }
    const outcome = limiter.take(session.user.id, CHECKS_PER_MINUTE);
    if (!outcome.allowed) {
      setResponseHeader(event, "retry-after", Math.ceil(outcome.retryAfter));
      throw createError({
        statusCode: 429,
        statusMessage: "Too many checks: try again in a minute",
      });
    }
    return checkConnection(usable, model, {
      log: (message) => console.warn(message),
    });
  },
);

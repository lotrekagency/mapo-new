import { createError, defineEventHandler, sendNoContent } from "h3";
import { requireMapoAiSession } from "../auth/nitro";
import { readJsonBody } from "../body";
import { readTokenInput } from "../keys/assignments";
import {
  KEYS_BODY_BYTES,
  actorOf,
  auditKeyAction,
  keyStores,
} from "../keys/nitro";
import { saveToken } from "../keys/store";
import { mapoAiUserPolicy } from "../run/nitro";

/**
 * `PUT /_mapo/ai/token`: saves the user's own token for a provider, sealed
 * in their space of the storage; it replaces theirs. Only where an admin's
 * assignment allows personal tokens to the user: 403 otherwise. The token
 * is used while the assignment allows it, and `status` says so; the audit
 * keeps that it was saved, never the token. 204.
 */
export default defineEventHandler(async (event) => {
  const session = await requireMapoAiSession(event);
  const stores = keyStores(event);
  const input = readTokenInput(await readJsonBody(event, KEYS_BODY_BYTES));
  const policy = await mapoAiUserPolicy(event, session.user);
  const usable = policy.providers.find(
    (one) => one.provider.id === input.provider,
  );
  if (usable?.key?.personal.allowed !== true) {
    throw createError({
      statusCode: 403,
      statusMessage: "Personal tokens are not allowed for this provider",
    });
  }
  const by = actorOf(session.user);
  await saveToken(
    stores.tokens,
    by,
    input.provider,
    input.token,
    new Date().toISOString(),
  );
  await auditKeyAction(event, stores.audit, {
    by,
    action: "token-saved",
    provider: input.provider,
    user: by.id,
  });
  return sendNoContent(event);
});

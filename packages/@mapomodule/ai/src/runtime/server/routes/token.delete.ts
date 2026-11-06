import { createError, defineEventHandler, getQuery, sendNoContent } from "h3";
import { requireMapoAiSession } from "../auth/nitro";
import { readTokenRemoval } from "../keys/assignments";
import { actorOf, auditKeyAction, keyStores } from "../keys/nitro";
import { removeToken } from "../keys/store";

/**
 * `DELETE /_mapo/ai/token?provider=…`: removes the user's own token for a
 * provider. An AI admin removes another user's with `&user=<id>`, the
 * backend's id. 204, whether or not there was one; the audit keeps a
 * removal that removed something.
 */
export default defineEventHandler(async (event) => {
  const session = await requireMapoAiSession(event);
  const query = readTokenRemoval(getQuery(event));
  const userId = query.user ?? session.user.id;
  const isOwn = userId === session.user.id;
  if (!isOwn && !session.admin) {
    throw createError({ statusCode: 403, statusMessage: "Not an AI admin" });
  }
  const stores = keyStores(event);
  const removed = await removeToken(stores.tokens, userId, query.provider);
  if (removed) {
    await auditKeyAction(event, stores.audit, {
      by: actorOf(session.user),
      action: "token-removed",
      provider: query.provider,
      user: userId,
    });
  }
  return sendNoContent(event);
});

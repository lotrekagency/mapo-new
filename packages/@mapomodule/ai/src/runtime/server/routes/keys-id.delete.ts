import {
  createError,
  defineEventHandler,
  getRouterParam,
  sendNoContent,
} from "h3";
import { requireMapoAiAdmin } from "../auth/nitro";
import { withoutAssignment } from "../keys/assignments";
import { actorOf, auditKeyAction, keyStores } from "../keys/nitro";
import { changeKeys } from "../keys/store";

/**
 * `DELETE /_mapo/ai/keys/:id`, for the AI's admins: removes an assignment,
 * its key with it. The users it was for fall back on the next level. 204;
 * 404 when there is no assignment of that id.
 */
export default defineEventHandler(async (event) => {
  const session = await requireMapoAiAdmin(event);
  const stores = keyStores(event);
  const id = getRouterParam(event, "id") ?? "";
  const removed = await changeKeys(stores.keys, (record) => {
    const result = withoutAssignment(record, id);
    if (!result) {
      throw createError({
        statusCode: 404,
        statusMessage: "No assignment of this id",
      });
    }
    return { record: result.record, result: result.removed };
  });
  await auditKeyAction(event, stores.audit, {
    by: actorOf(session.user),
    action: "assignment-removed",
    provider: removed.provider,
    scope: removed.scope,
  });
  return sendNoContent(event);
});

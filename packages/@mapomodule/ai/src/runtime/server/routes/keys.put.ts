import { defineEventHandler, setResponseHeader } from "h3";
import type { MapoAiKeyAssignment } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { readJsonBody } from "../body";
import {
  assignmentView,
  newAssignmentId,
  readAssignmentInput,
  withAssignment,
} from "../keys/assignments";
import {
  KEYS_BODY_BYTES,
  actorOf,
  auditKeyAction,
  keyStores,
} from "../keys/nitro";
import { changeKeys } from "../keys/store";
import { assignableProviders, mapoAiPolicy } from "../run/nitro";

/**
 * `PUT /_mapo/ai/keys`, for the AI's admins: saves an assignment, which
 * replaces the one of the same scope and provider; what the body leaves
 * out of a replacement stays as it was. It answers the assignment as `GET`
 * lists it, without the key. The audit keeps who changed what, never the
 * key.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiKeyAssignment> => {
    setResponseHeader(event, "cache-control", "no-store");
    const session = await requireMapoAiAdmin(event);
    const stores = keyStores(event);
    const input = readAssignmentInput(
      await readJsonBody(event, KEYS_BODY_BYTES),
    );
    const providers = assignableProviders(mapoAiPolicy(event));
    const by = actorOf(session.user);
    const saved = await changeKeys(stores.keys, (record) => {
      const result = withAssignment(record, input, {
        providers,
        by,
        at: new Date().toISOString(),
        newId: newAssignmentId,
      });
      return { record: result.record, result };
    });
    await auditKeyAction(event, stores.audit, {
      by,
      action: "assignment-saved",
      provider: saved.assignment.provider,
      scope: saved.assignment.scope,
      keyChanged: saved.keyChanged,
    });
    return assignmentView(saved.assignment);
  },
);

import { defineEventHandler, setResponseHeader } from "h3";
import { requireMapoAiAdmin } from "../auth/nitro";
import { readJsonBody } from "../body";
import { readGroupsInput } from "../keys/assignments";
import {
  KEYS_BODY_BYTES,
  actorOf,
  auditKeyAction,
  keyStores,
} from "../keys/nitro";
import { changeKeys } from "../keys/store";

/**
 * `PUT /_mapo/ai/keys/groups`, for the AI's admins: the order of the
 * groups, highest priority first. A user in several groups gets the
 * assignment of the highest; the groups the order leaves out come after,
 * by name.
 */
export default defineEventHandler(
  async (event): Promise<{ groups: string[] }> => {
    setResponseHeader(event, "cache-control", "no-store");
    const session = await requireMapoAiAdmin(event);
    const stores = keyStores(event);
    const groups = readGroupsInput(await readJsonBody(event, KEYS_BODY_BYTES));
    await changeKeys(stores.keys, (record) => ({
      record: { ...record, groups },
      result: undefined,
    }));
    await auditKeyAction(event, stores.audit, {
      by: actorOf(session.user),
      action: "groups-ordered",
    });
    return { groups: [...groups] };
  },
);

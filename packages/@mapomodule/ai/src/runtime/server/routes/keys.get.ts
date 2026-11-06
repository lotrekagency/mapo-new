import { defineEventHandler, setResponseHeader } from "h3";
import type { MapoAiKeysAnswer } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { assignmentView } from "../keys/assignments";
import { keyStores } from "../keys/nitro";
import { listTokens, readKeys } from "../keys/store";
import { assignableProviders, mapoAiPolicy } from "../run/nitro";

/**
 * `GET /_mapo/ai/keys`, for the AI's admins: the providers the app enables,
 * the keys the admins assigned (to everyone, a group or a user), the order
 * of the groups, and the tokens the users saved. Never a key: only its last
 * four characters.
 */
export default defineEventHandler(async (event): Promise<MapoAiKeysAnswer> => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireMapoAiAdmin(event);
  const stores = keyStores(event);
  const record = await readKeys(stores.keys);
  return {
    providers: assignableProviders(mapoAiPolicy(event)),
    assignments: record.assignments.map(assignmentView),
    groups: [...record.groups],
    tokens: await listTokens(stores.tokens),
  };
});

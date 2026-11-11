/**
 * What the gateway's `run` route reads from Nitro, without a Nitro server:
 * the runtime config of `mapo.ai`, the encrypted storage, in memory, and
 * the backend that knows the user, a superuser here. The evaluation mocks
 * `nitropack/runtime` with it, as `src/__tests__/fill-gateway.test.ts`
 * does, so each case goes through the route as an app's call does.
 */
import { createStorage, prefixStorage } from "unstorage";
import type { Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";

/** Seals the evaluation's storage, which lives in memory for one run. */
const SECRET = "mapo-ai-evaluation-secret-0123456789-abcdef";

const USER = {
  id: 1,
  username: "evaluator",
  is_superuser: true,
  all_permissions: [],
};

const state: { config: Record<string, unknown>; root?: Storage } = {
  config: {},
};

/** The functions of `nitropack/runtime` the route calls. */
export function nitroRuntime() {
  const root = (): Storage => {
    if (!state.root) throw new Error("configureNitro() was not called");
    return state.root;
  };
  return {
    useRuntimeConfig: () => state.config,
    useStorage: (base = "") => (base ? prefixStorage(root(), base) : root()),
    useNitroApp: () => ({
      localFetch: () => Response.json(USER),
      hooks: { callHook: async () => {} },
    }),
  };
}

/**
 * A new storage, and `mapo.ai` as the runtime config holds it: the
 * providers, their models, the default. A provider's key goes in its own
 * entry, as `NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY` puts it there in an app.
 */
export function configureNitro(mapoAi: Record<string, unknown>): void {
  const root = createStorage();
  root.mount("mapo-ai", memoryDriver());
  state.root = root;
  state.config = {
    app: { baseURL: "/" },
    public: { mapoCore: { userInfoApi: "/api/profiles/me/" } },
    mapoAi: { secret: SECRET, admin: {}, ...mapoAi },
  };
}

import { shallowRef } from "vue";
import type { Ref } from "vue";
import { useNuxtApp } from "nuxt/app";
import { MAPO_AI_GATEWAY_PATH } from "../shared/gateway";
import type { MapoAiStatus } from "../shared/gateway";
import { readMapoAiStatus } from "../shared/magicFill";
import { gatewayGetter } from "./poster";
import type { GatewayGetter } from "./poster";

/** What `useMapoAiStatus()` gives a page. */
export interface MapoAiStatusState {
  /**
   * What `GET /_mapo/ai/status` answered, read as outside data;
   * `undefined` until it answers. A request that fails keeps the last
   * answer: a passing failure of the network takes nothing from the page.
   */
  status: Readonly<Ref<MapoAiStatus | undefined>>;
  /** While `status` is asked. */
  loading: Readonly<Ref<boolean>>;
  /**
   * Asks `status` again, one request at a time: a second call while one
   * is under way gets the same. Resolves once it answered or failed.
   */
  refresh(): Promise<void>;
}

const states = new WeakMap<object, MapoAiStatusState>();

/**
 * What the AI gateway offers the signed-in user: whether the app lets them
 * use the AI, the providers and models they may call, the limits and the
 * formats `read` takes. One state per app, asked with `refresh()`: a page
 * offers the AI only once it knows it may, and nothing when the gateway
 * cannot be reached. The answer is the user's own: ask it again where it
 * may have changed, as when another user signs in.
 *
 * @example
 * const { status, refresh } = useMapoAiStatus();
 * onMounted(refresh);
 * const canUseAi = computed(() => status.value?.allowed === true);
 */
export function useMapoAiStatus(): MapoAiStatusState {
  const app = useNuxtApp();
  let state = states.get(app);
  if (!state) {
    state = statusState(gatewayGetter(app));
    states.set(app, state);
  }
  return state;
}

function statusState(get: GatewayGetter): MapoAiStatusState {
  const status = shallowRef<MapoAiStatus>();
  const loading = shallowRef(false);
  let asking: Promise<void> | undefined;

  async function ask(): Promise<void> {
    loading.value = true;
    try {
      const answer = await get(`${MAPO_AI_GATEWAY_PATH}/status`);
      status.value = readMapoAiStatus(answer);
    } catch {
      // The last answer stays: a passing failure of the network must not
      // take the panel from an operator who is writing in it. A gateway
      // never reached offers nothing.
    } finally {
      loading.value = false;
    }
  }

  return {
    status,
    loading,
    refresh() {
      asking ??= ask().finally(() => {
        asking = undefined;
      });
      return asking;
    },
  };
}

import { defineStore } from "pinia";
import { SnackTypeEnum } from "../types";
import type { SnackMessage, SnackType } from "../types";

/** Incremental id source used for snack message keys. */
let _nextId = 0;

/**
 * Global snackbar message queue store.
 *
 * Messages are appended via `show()` and can be dismissed individually,
 * from the tail, or all at once.
 */
export const useSnackStore = defineStore("mapo-snack", {
  state: () => ({
    messages: [] as SnackMessage[],
  }),

  getters: {
    current: (state): SnackMessage | null =>
      state.messages[state.messages.length - 1] ?? null,
  },

  actions: {
    /**
     * Pushes a new snackbar message into the queue.
     *
     * @param message Message text.
     * @param type Visual message type.
     * @param duration Auto-dismiss timeout in milliseconds.
     */
    show(
      message: string,
      type: SnackType = SnackTypeEnum.Info,
      duration = 4000,
    ) {
      this.messages.push({ id: ++_nextId, message, type, duration });
    },

    /**
     * Dismisses a message by id, or the latest one when no id is provided.
     *
     * @param id Optional message id.
     */
    dismiss(id?: number) {
      if (id !== undefined) {
        this.messages = this.messages.filter((m) => m.id !== id);
      } else {
        this.messages.pop();
      }
    },

    /** Clears the full snackbar queue. */
    dismissAll() {
      this.messages = [];
    },
  },
});

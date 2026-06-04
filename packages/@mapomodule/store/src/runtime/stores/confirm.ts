import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { ConfirmOptions } from "../types";

/**
 * Global confirm-dialog store backed by a promise-based API.
 *
 * `ask()` opens the dialog and returns a promise resolved by `confirm()` or
 * `cancel()`, allowing calling code to await a boolean user decision.
 */
export const useConfirmStore = defineStore("mapo-confirm", () => {
  const active = ref(false);
  const options = ref<ConfirmOptions | null>(null);
  const _resolve = shallowRef<((value: boolean) => void) | null>(null);

  /**
   * Opens the confirm dialog and waits for user choice.
   *
   * @param opts Dialog options (title, message, labels, etc.).
   * @returns Promise resolved with `true` on confirm, `false` on cancel.
   */
  function ask(opts: ConfirmOptions): Promise<boolean> {
    options.value = opts;
    active.value = true;
    return new Promise<boolean>((resolve) => {
      _resolve.value = resolve;
    });
  }

  /** Resolves the pending confirmation as accepted and closes the dialog. */
  function confirm() {
    _resolve.value?.(true);
    _close();
  }

  /** Resolves the pending confirmation as rejected and closes the dialog. */
  function cancel() {
    _resolve.value?.(false);
    _close();
  }

  /** Resets internal dialog state after a decision. */
  function _close() {
    active.value = false;
    options.value = null;
    _resolve.value = null;
  }

  return { active, options, ask, confirm, cancel };
});

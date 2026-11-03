import { defineNitroPlugin, useStorage } from "nitropack/runtime";
import type { H3Event } from "h3";
import { MAPO_AI_STORAGE_MOUNT } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { hasMapoAiMount, useMapoAiSecret } from "../storage/nitro";
import { sweepExpired } from "../storage/sealed";
import { secretNotice } from "../storage/secret";

/** How often the expired records are swept, besides when the server starts. */
const SWEEP_EVERY_MS = 60 * 60 * 1000;

const NO_MOUNT = `[mapo-ai] No storage is mounted at "${MAPO_AI_STORAGE_MOUNT}": the AI storage is closed. Mount a driver there as for any Nitro storage, in nitro.storage or from a Nitro plugin.`;

/**
 * Checks the module's storage when the server starts and says in the log
 * what keeps it closed, then sweeps the expired records: at start and every
 * hour. The sweep reads only the expiry written in clear, so it runs even
 * when the secret is missing; a round with nothing mounted is skipped, so a
 * driver mounted later is swept from the next one. Nothing runs while pages
 * are prerendered.
 *
 * It starts once the app's own plugins have run (Nitro runs the plugins of
 * modules first), because one of them may mount a driver at `mapo-ai` when
 * the server starts, in place of the module's default.
 *
 * Some runtimes, such as Cloudflare Workers, allow no timer while the server
 * starts, and a plugin that throws stops the server. There the checks wait
 * for the first request, whose event carries the environment, and expired
 * records go only when they are read.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return;

  let starting: ReturnType<typeof setTimeout>;
  try {
    starting = setTimeout(() => {
      check();
      sweep();
      const timer = setInterval(sweep, SWEEP_EVERY_MS);
      unref(timer);
      nitroApp.hooks.hook("close", () => clearInterval(timer));
    }, 0);
  } catch {
    let isChecked = false;
    const unhook = nitroApp.hooks.hook("request", (event) => {
      unhook();
      if (isChecked) return;
      isChecked = true;
      check(event);
    });
    return;
  }
  nitroApp.hooks.hook("close", () => clearTimeout(starting));
});

/** Says in the log what keeps the storage closed: the secret, or the mount. */
function check(event?: H3Event): void {
  const notice = secretNotice(useMapoAiSecret(event));
  if (notice) console[notice.level](notice.message);
  if (!hasMapoAiMount()) console.error(NO_MOUNT);
}

/** One round of the sweep, in the background; skipped while nothing is mounted. */
function sweep(): void {
  if (!hasMapoAiMount()) return;
  sweepExpired(useStorage(MAPO_AI_STORAGE_MOUNT), Date.now()).then(
    ({ failed }) => {
      if (failed > 0) {
        console.warn(
          `[mapo-ai] The sweep could not check or remove ${failed} records; it tries again in an hour.`,
        );
      }
    },
    (error: unknown) => {
      console.warn(
        `[mapo-ai] The sweep could not list the records: ${String(error)}`,
      );
    },
  );
}

/**
 * Lets the process end while the timer waits: on Node a timer keeps it
 * alive, and the server's own life should decide. Other runtimes have no
 * `unref`, and need none.
 */
function unref(timer: unknown): void {
  if (isRecord(timer) && typeof timer.unref === "function") timer.unref();
}

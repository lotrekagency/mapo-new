/**
 * `read` wired to the app's Nitro server: the readers that are on, from the
 * registry and `mapo.ai.readers` in the runtime config, the limits, and the
 * app's `mapo-ai:read` hooks. The logic lives in `read.ts` and
 * `registry.ts`, which the tests run without Nitro.
 */

import type { H3Event } from "h3";
import { useNitroApp } from "nitropack/runtime";
import type { MapoAiReaderStatus } from "../../shared/gateway";
import type { MapoAiSession } from "../auth/nitro";
import { mapoAiRunOptions } from "../run/nitro";
import type { MapoAiRunOptions } from "../run/options";
import type { ReadDependencies } from "./read";
import { mapoAiReaders, readerStatuses } from "./registry";
import type { MapoAiReadContext } from "./types";

/** What `read` needs from the server, for this request. */
export function mapoAiReadDependencies(
  event: H3Event,
  session: MapoAiSession,
): ReadDependencies & { maxFileBytes: number } {
  const options = mapoAiRunOptions(event);
  return {
    readers: mapoAiReaders(),
    isOn: (id) => isOn(options, id),
    maxChars: options.limits.maxSourceChars,
    maxFileBytes: options.limits.maxFileBytes,
    touchUp: (facts) => askReadHooks(event, session, facts),
  };
}

/** The formats `read` takes, as `status` lists them: the readers that are on. */
export function mapoAiReaderStatuses(event?: H3Event): MapoAiReaderStatus[] {
  const options = mapoAiRunOptions(event);
  return readerStatuses(mapoAiReaders((id) => isOn(options, id)));
}

/** Whether a reader is on: every one `mapo.ai.readers` does not turn off. */
function isOn(options: MapoAiRunOptions, id: string): boolean {
  return !Object.hasOwn(options.readers, id) || options.readers[id] !== false;
}

/** Runs the app's `mapo-ai:read` hooks: the parts they leave, as outside data. */
async function askReadHooks(
  event: H3Event,
  session: MapoAiSession,
  facts: Pick<MapoAiReadContext, "file" | "reader" | "parts">,
): Promise<unknown> {
  const context: MapoAiReadContext = {
    event,
    user: session.user,
    admin: session.admin,
    file: facts.file,
    reader: facts.reader,
    // Copies: what a hook does to them changes nothing the reader returned.
    parts: facts.parts.map((part) => ({ ...part })),
  };
  await useNitroApp().hooks.callHook("mapo-ai:read", context);
  return context.parts;
}

import { resolve } from "node:path";
import { MAPO_AI_STORAGE_MOUNT } from "./runtime/shared/gateway";

/** The resolved Nitro options the default mount reads and fills. */
export interface StorageMountOptions {
  dev: boolean;
  /** Whether the preset runs on Node, with a file system. */
  node: boolean;
  rootDir: string;
  storage: Record<string, unknown>;
  devStorage: Record<string, unknown>;
}

/**
 * Where the module's state went: a mount of the app's own, the file system
 * by default (in development, or on a preset that runs on Node), or nowhere.
 */
export type StorageMountChoice = "app" | "development" | "node-server" | "none";

/**
 * Mounts the file system at `mapo-ai` when the app mounts nothing there,
 * with the rules Nitro follows for its own `data` mount:
 * - in development, `.data/mapo-ai` in the app's root, unless the app
 *   mounts `mapo-ai` in `storage` or `devStorage`;
 * - otherwise, on a preset that runs on Node, `./.data/mapo-ai` from the
 *   server's working directory, unless the app mounts it in `storage`
 *   (`devStorage` is for development only). Serverless functions on Node get
 *   the folder too, though their file system does not keep it;
 * - on a preset without Node (edge runtimes), nothing: the app mounts a
 *   driver, and until it does the storage is closed.
 */
export function addDefaultStorageMount(
  options: StorageMountOptions,
): StorageMountChoice {
  const isMountedByApp = mounts(options.storage);
  const isMountedForDev = mounts(options.devStorage);

  if (options.dev) {
    if (isMountedByApp || isMountedForDev) return "app";
    options.devStorage[MAPO_AI_STORAGE_MOUNT] = {
      driver: "fs",
      base: resolve(options.rootDir, ".data", MAPO_AI_STORAGE_MOUNT),
    };
    return "development";
  }
  if (isMountedByApp) return "app";
  if (!options.node) return "none";
  options.storage[MAPO_AI_STORAGE_MOUNT] = {
    driver: "fsLite",
    base: `./.data/${MAPO_AI_STORAGE_MOUNT}`,
  };
  return "node-server";
}

/**
 * Whether `storage` mounts something at `mapo-ai`, however the key is
 * written: Nitro reads `mapo-ai:` or `/mapo-ai/` as the same mount, and a
 * second one there would stop the server ("already mounted").
 */
function mounts(storage: Record<string, unknown>): boolean {
  return Object.entries(storage).some(
    ([key, mount]) =>
      mount !== undefined && mountName(key) === MAPO_AI_STORAGE_MOUNT,
  );
}

/** A mount's key as unstorage normalizes it: `:` between segments, none at the ends. */
function mountName(key: string): string {
  return key.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

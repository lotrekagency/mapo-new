#!/usr/bin/env node
/**
 * Removes the declaration files emitted inside `dist/runtime/mcp/`.
 *
 * `@nuxtjs/mcp-toolkit` globs `*.{ts,js,mts,mjs}` in every scanned definition
 * directory. Its `**\/*.d.ts` ignore pattern does not match our files because
 * they live outside the consuming app's cwd, so `get-doc.d.ts` would be loaded
 * as a definition and fail the Nitro build with "default is not exported".
 *
 * These declarations have no consumer value: the definitions are internal, and
 * the package's `./runtime/*` export maps types to `src/`.
 */
import { readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanned = join(packageRoot, "dist", "runtime", "mcp");

let removed = 0;

function clean(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Nothing built yet, or a stub symlink to `src` — both fine.
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) clean(full);
    else if (/\.d\.(?:ts|mts|cts)$/.test(entry.name)) {
      rmSync(full);
      removed += 1;
    }
  }
}

clean(scanned);

if (removed) console.log(`[mapo-mcp] removed ${removed} declaration file(s) from dist/runtime/mcp`);

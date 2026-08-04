/**
 * The only place in this package that writes to disk.
 *
 * Scaffolding is a dry run by default; when the caller opts in, every path goes
 * through here. Kept small and separate so the dangerous surface is one file
 * with one test suite: containment inside the project root, no silent
 * overwrite, and no writing at all unless the adapter allows it.
 */
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

export interface WriteRequest {
  /** Path relative to the project root. */
  path: string;
  content: string;
}

export type WriteStatus =
  | "written"
  | "exists"
  | "outside-root"
  | "absolute-path"
  | "not-allowed";

export interface WriteOutcome {
  path: string;
  status: WriteStatus;
  /** Absolute destination, when the write was attempted. */
  absolute?: string;
  reason?: string;
}

export interface WriteOptions {
  /** Absolute path of the project. Everything must land inside it. */
  root: string;
  /** Overwrite existing files. Off by default: generated code is a proposal. */
  overwrite?: boolean;
  /**
   * Adapters pass `false` outside development. A write tool that works in
   * production is a remote code execution primitive.
   */
  allowed?: boolean;
}

/**
 * Resolves `relative` against `root` and proves the result stays inside it,
 * following symlinks on the deepest existing ancestor — `pages` could itself be
 * a link pointing anywhere.
 */
export function resolveInsideRoot(
  root: string,
  relative: string,
): string | null {
  if (isAbsolute(relative)) return null;

  const realRoot = existsSync(root) ? realpathSync(root) : resolve(root);
  const target = resolve(realRoot, relative);

  // Walk up to the closest existing directory and resolve *that* for real.
  let existing = target;
  while (!existsSync(existing) && dirname(existing) !== existing) {
    existing = dirname(existing);
  }

  const realExisting = existsSync(existing) ? realpathSync(existing) : existing;
  const rest = target.slice(existing.length);
  const realTarget = join(realExisting, rest);

  const boundary = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  return realTarget === realRoot || realTarget.startsWith(boundary)
    ? realTarget
    : null;
}

/** Writes the scaffolded files, reporting what happened to each one. */
export function writeScaffold(
  files: WriteRequest[],
  { root, overwrite = false, allowed = true }: WriteOptions,
): WriteOutcome[] {
  return files.map((file) => {
    if (!allowed) {
      return {
        path: file.path,
        status: "not-allowed" as const,
        reason: "writing is only available while the app runs in development",
      };
    }

    if (isAbsolute(file.path)) {
      return {
        path: file.path,
        status: "absolute-path" as const,
        reason: "paths must be relative to the project root",
      };
    }

    const absolute = resolveInsideRoot(root, file.path);
    if (!absolute) {
      return {
        path: file.path,
        status: "outside-root" as const,
        reason: `resolves outside ${root}`,
      };
    }

    if (existsSync(absolute) && !overwrite) {
      return {
        path: file.path,
        status: "exists" as const,
        absolute,
        reason: "pass overwrite: true to replace it",
      };
    }

    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.content, "utf-8");
    return { path: file.path, status: "written" as const, absolute };
  });
}

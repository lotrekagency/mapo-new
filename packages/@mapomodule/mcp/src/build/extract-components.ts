/**
 * Extracts the public API of every `Mapo*` component from its source.
 *
 * Build-time only: `vue-component-meta` is a devDependency and must never reach
 * the runtime bundle. Source is the ground truth — the curated tables in
 * `docs/uikit/api.md` drift (they listed 11 props for MapoDetail while the
 * component declared 17).
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createChecker } from "vue-component-meta";
import type { ApiMember, ComponentApi } from "../runtime/core/types.js";

/** Packages whose `runtime/components` tree is scanned. */
const COMPONENT_PACKAGES = [
  { pkg: "@mapomodule/uikit", dir: "packages/@mapomodule/uikit" },
  { pkg: "@mapomodule/form", dir: "packages/@mapomodule/form" },
];

/** Union types can be enormous; keep them readable in a tool response. */
const MAX_TYPE_LENGTH = 160;

function shortenType(type: string): string {
  const collapsed = type.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_TYPE_LENGTH
    ? `${collapsed.slice(0, MAX_TYPE_LENGTH)}…`
    : collapsed;
}

function firstSentence(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const trimmed = description.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function collectVueFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".vue")) files.push(full);
    }
  };

  walk(root);
  return files.sort();
}

interface MetaMember {
  name: string;
  type?: string;
  required?: boolean;
  default?: string;
  description?: string;
  global?: boolean;
}

function toMembers(
  entries: MetaMember[] | undefined,
  withType = true,
): ApiMember[] {
  return (entries ?? []).map((entry) => ({
    name: entry.name,
    ...(withType && entry.type ? { type: shortenType(entry.type) } : {}),
    ...(entry.required !== undefined ? { required: entry.required } : {}),
    ...(entry.default !== undefined && entry.default !== "undefined"
      ? { default: shortenType(String(entry.default)) }
      : {}),
    ...(firstSentence(entry.description)
      ? { description: firstSentence(entry.description)! }
      : {}),
  }));
}

/**
 * @param repoRoot absolute path of the monorepo root
 * @param docsFor  resolves the doc sections that mention a symbol
 */
export function extractComponents(
  repoRoot: string,
  docsFor: (symbol: string) => string[],
): ComponentApi[] {
  const components: ComponentApi[] = [];

  for (const { pkg, dir } of COMPONENT_PACKAGES) {
    const packageRoot = join(repoRoot, dir);
    const tsconfig = join(packageRoot, "tsconfig.json");
    const componentsRoot = join(packageRoot, "src", "runtime", "components");
    const files = collectVueFiles(componentsRoot).filter((file) =>
      /\/Mapo[A-Z][^/]*\.vue$/.test(file),
    );
    if (!files.length || !existsSync(tsconfig)) continue;

    const checker = createChecker(tsconfig, {
      forceUseTs: true,
      printer: { newLine: 1 },
    });

    for (const file of files) {
      const name = file
        .split("/")
        .pop()!
        .replace(/\.vue$/, "");
      try {
        const meta = checker.getComponentMeta(file);
        const props = (meta.props as MetaMember[]).filter(
          (prop) => !prop.global,
        );

        components.push({
          name,
          pkg,
          file: relative(repoRoot, file),
          ...(firstSentence(meta.description)
            ? { description: firstSentence(meta.description)! }
            : {}),
          props: toMembers(props),
          events: toMembers(meta.events as MetaMember[]),
          slots: toMembers(meta.slots as MetaMember[]),
          exposed: toMembers(meta.exposed as MetaMember[]),
          docs: docsFor(name),
        });
      } catch (error) {
        // A single unresolvable component must not break the whole build.
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[mapo-mcp] skipped ${name}: ${message}`);
      }
    }
  }

  return components.sort((a, b) => a.name.localeCompare(b.name));
}

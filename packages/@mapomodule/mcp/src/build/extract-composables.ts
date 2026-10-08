/**
 * Extracts the composables each Mapo module auto-imports.
 *
 * The module's `addImports([...])` calls are the authoritative list of what an
 * app can call without importing anything — exactly what an assistant needs to
 * know, and what it cannot infer from `node_modules`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { ComposableApi } from "../runtime/core/types.js";

const PACKAGES_ROOT = "packages/@mapomodule";
const MAX_SIGNATURE_LENGTH = 220;

/** `{ name: "useCrud", from: resolver.resolve("./runtime/api/crud") }` */
const ADD_IMPORT_ENTRY =
  /name:\s*"([A-Za-z_$][\w$]*)"[\s\S]{0,160}?from:[\s\S]{0,120}?"(\.[^"]+)"/g;

function shorten(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_SIGNATURE_LENGTH
    ? `${collapsed.slice(0, MAX_SIGNATURE_LENGTH)}…`
    : collapsed;
}

interface Candidate {
  name: string;
  pkg: string;
  file: string;
}

/** Reads every `addImports` entry declared by the Mapo modules. */
function collectCandidates(repoRoot: string): Candidate[] {
  const packagesDir = join(repoRoot, PACKAGES_ROOT);
  if (!existsSync(packagesDir)) return [];

  const candidates: Candidate[] = [];

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const moduleFile = join(packagesDir, entry.name, "src", "module.ts");
    if (!existsSync(moduleFile)) continue;

    const source = readFileSync(moduleFile, "utf-8");
    const packageRoot = join(packagesDir, entry.name);

    for (const match of source.matchAll(ADD_IMPORT_ENTRY)) {
      const [, name, from] = match;
      if (!name || !from) continue;

      const base = join(packageRoot, "src", from.replace(/^\.\//, ""));
      const file = [".ts", ".mts", "/index.ts"]
        .map((suffix) => `${base}${suffix}`)
        .find((path) => existsSync(path));

      if (file)
        candidates.push({ name, pkg: `@mapomodule/${entry.name}`, file });
    }
  }

  return candidates;
}

export function extractComposables(
  repoRoot: string,
  docsFor: (symbol: string) => string[],
): ComposableApi[] {
  const candidates = collectCandidates(repoRoot);
  if (!candidates.length) return [];

  const program = ts.createProgram(
    candidates.map((candidate) => candidate.file),
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
    },
  );
  const checker = program.getTypeChecker();

  const composables: ComposableApi[] = [];

  for (const candidate of candidates) {
    const source = program.getSourceFile(candidate.file);
    const moduleSymbol = source
      ? checker.getSymbolAtLocation(source)
      : undefined;
    const exported = moduleSymbol
      ? checker
          .getExportsOfModule(moduleSymbol)
          .find((symbol) => symbol.getName() === candidate.name)
      : undefined;

    const declaration =
      exported?.valueDeclaration ?? exported?.declarations?.[0];
    const signature =
      exported && declaration
        ? checker.typeToString(
            checker.getTypeOfSymbolAtLocation(exported, declaration),
          )
        : undefined;
    const description = exported
      ? ts
          .displayPartsToString(exported.getDocumentationComment(checker))
          .trim()
      : "";

    composables.push({
      name: candidate.name,
      pkg: candidate.pkg,
      file: relative(repoRoot, candidate.file),
      ...(signature ? { signature: shorten(signature) } : {}),
      ...(description ? { description: description.replace(/\s+/g, " ") } : {}),
      docs: docsFor(candidate.name),
    });
  }

  return composables.sort((a, b) => a.name.localeCompare(b.name));
}

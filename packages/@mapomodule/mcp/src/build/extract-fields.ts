/**
 * Extracts the form field contract from `@mapomodule/form` source:
 * the registry (which component renders each `type`, plus its default attrs)
 * and the descriptor interfaces (which `attrs` each type accepts, with docs).
 *
 * These are exactly the details models invent, so they come from source, never
 * from prose.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { ApiMember, FieldTypeApi } from "../runtime/core/types.js";

const FORM_PACKAGE = "packages/@mapomodule/form";
const DESCRIPTOR_FILE = "src/runtime/types/descriptor.ts";
const REGISTRY_FILE = "src/runtime/registry/defaults.ts";

const MAX_TYPE_LENGTH = 160;

interface RegistryShape {
  mapping: Record<string, unknown>;
  attrs: Record<string, Record<string, unknown>>;
  accessor: Record<string, unknown>;
}

interface DescriptorInfo {
  interfaceName: string;
  description?: string;
  types: string[];
  attrs: ApiMember[];
}

function shorten(value: string): string {
  // Source-declared types can carry inline JSDoc on their members; drop it.
  const collapsed = value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > MAX_TYPE_LENGTH
    ? `${collapsed.slice(0, MAX_TYPE_LENGTH)}…`
    : collapsed;
}

function docOf(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): string | undefined {
  if (!symbol) return undefined;
  const text = ts
    .displayPartsToString(symbol.getDocumentationComment(checker))
    .trim();
  return text ? text.replace(/\s+/g, " ") : undefined;
}

/** Turns `"text" | "textarea"` into `["text", "textarea"]`. */
function literalsOf(typeText: string): string[] {
  return [...typeText.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

function membersOf(type: ts.Type, checker: ts.TypeChecker): ApiMember[] {
  return checker.getPropertiesOfType(type).map((property) => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];

    // Prefer the type as written in the source: the checker expands mapped
    // types (`DeepKeyOf<T>` becomes an unreadable wall of conditionals).
    const declared =
      declaration && ts.isPropertySignature(declaration) && declaration.type
        ? declaration.type.getText()
        : undefined;
    const resolved = declaration
      ? checker.typeToString(
          checker.getTypeOfSymbolAtLocation(property, declaration),
        )
      : undefined;
    const type_ = declared ?? resolved;

    return {
      name: property.getName(),
      ...(type_ ? { type: shorten(type_) } : {}),
      required: !(property.flags & ts.SymbolFlags.Optional),
      ...(docOf(property, checker)
        ? { description: docOf(property, checker)! }
        : {}),
    };
  });
}

/** Reads every `*Descriptor` interface plus the shared `FieldBase` members. */
function readDescriptors(descriptorPath: string): {
  descriptors: DescriptorInfo[];
  common: ApiMember[];
} {
  const program = ts.createProgram([descriptorPath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });

  const checker = program.getTypeChecker();
  const source = program.getSourceFile(descriptorPath);
  if (!source) return { descriptors: [], common: [] };

  const descriptors: DescriptorInfo[] = [];
  let common: ApiMember[] = [];

  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue;

    const name = statement.name.text;
    const type = checker.getTypeAtLocation(statement.name);

    if (name === "FieldBase") {
      // `key`/`type` are per-descriptor; everything else is shared behaviour.
      common = membersOf(type, checker).filter(
        (member) => member.name !== "type",
      );
      continue;
    }

    const extendsFieldBase = statement.heritageClauses?.some((clause) =>
      clause.types.some(
        (heritage) => heritage.expression.getText(source) === "FieldBase",
      ),
    );
    if (!extendsFieldBase) continue;

    const properties = checker.getPropertiesOfType(type);
    const typeProperty = properties.find(
      (property) => property.getName() === "type",
    );
    const attrsProperty = properties.find(
      (property) => property.getName() === "attrs",
    );

    const typeDeclaration =
      typeProperty?.valueDeclaration ?? typeProperty?.declarations?.[0];
    const typeText = typeDeclaration
      ? checker.typeToString(
          checker.getTypeOfSymbolAtLocation(typeProperty!, typeDeclaration),
        )
      : "";

    const attrsDeclaration =
      attrsProperty?.valueDeclaration ?? attrsProperty?.declarations?.[0];
    const attrs = attrsDeclaration
      ? membersOf(
          checker.getNonNullableType(
            checker.getTypeOfSymbolAtLocation(attrsProperty!, attrsDeclaration),
          ),
          checker,
        )
      : [];

    descriptors.push({
      interfaceName: name,
      ...(docOf(checker.getSymbolAtLocation(statement.name), checker)
        ? {
            description: docOf(
              checker.getSymbolAtLocation(statement.name),
              checker,
            )!,
          }
        : {}),
      types: literalsOf(typeText),
      attrs,
    });
  }

  return { descriptors, common };
}

/** `() => import("../components/fields/MapoDateField.vue")` → `MapoDateField`. */
function componentNameOf(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "function") return undefined;
  const match = /([\w-]+)\.vue/.exec(String(entry));
  return match?.[1];
}

export async function extractFieldTypes(
  repoRoot: string,
  docsFor: (symbol: string) => string[],
): Promise<{ fieldTypes: FieldTypeApi[]; fieldCommon: ApiMember[] }> {
  const descriptorPath = join(repoRoot, FORM_PACKAGE, DESCRIPTOR_FILE);
  const registryPath = join(repoRoot, FORM_PACKAGE, REGISTRY_FILE);

  if (!existsSync(descriptorPath) || !existsSync(registryPath)) {
    console.warn(
      "[mapo-mcp] form package sources not found — skipping field extraction",
    );
    return { fieldTypes: [], fieldCommon: [] };
  }

  const { descriptors, common } = readDescriptors(descriptorPath);

  // The registry's lazy `() => import(...)` entries are never invoked here, so
  // importing the module has no side effect beyond building the object.
  const { createJiti } = await import("jiti");
  const module_ = (await createJiti(import.meta.url).import(
    pathToFileURL(registryPath).href,
  )) as { defaultRegistry: RegistryShape };
  const registry = module_.defaultRegistry;

  const byType = new Map<string, FieldTypeApi>();

  for (const descriptor of descriptors) {
    for (const type of descriptor.types) {
      byType.set(type, {
        type,
        descriptor: descriptor.interfaceName,
        ...(descriptor.description
          ? { description: descriptor.description }
          : {}),
        attrs: descriptor.attrs,
        docs: docsFor(type),
      });
    }
  }

  // Types present in the registry but without a dedicated descriptor still
  // exist at runtime — report them rather than hiding them.
  for (const type of Object.keys(registry.mapping ?? {})) {
    if (!byType.has(type))
      byType.set(type, { type, attrs: [], docs: docsFor(type) });
  }

  for (const [type, entry] of byType) {
    const component = componentNameOf(registry.mapping?.[type]);
    if (component) entry.component = component;

    const defaults = {
      ...(registry.attrs?.All ?? {}),
      ...(registry.attrs?.[type] ?? {}),
    };
    if (Object.keys(defaults).length) entry.defaultAttrs = defaults;

    if (registry.accessor?.[type]) entry.hasAccessor = true;
  }

  return {
    fieldTypes: [...byType.values()].sort((a, b) =>
      a.type.localeCompare(b.type),
    ),
    fieldCommon: common,
  };
}

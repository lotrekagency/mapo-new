/**
 * Scaffold entry point: turns a `kind` plus a few arguments into files.
 *
 * Generation is pure — no filesystem access here. Writing is a separate,
 * guarded step (`../write.ts`), so the default behaviour stays a dry run and
 * the dangerous part has one place to audit.
 */
import { parseFields } from "./fields.js";
import * as templates from "./templates.js";
import type { TemplateInput, TemplateOutput } from "./templates.js";
import type { ApiKnowledge } from "../types.js";

export const SCAFFOLD_KINDS = [
  "list-page",
  "detail-page",
  "standalone-form",
  "custom-field",
  "login-page",
  "theme-override",
  "backend-proxy",
  "menu-page",
  "media-page",
] as const;

export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number];

/** What each kind produces, for the tool's own documentation. */
export const SCAFFOLD_DESCRIPTIONS: Record<ScaffoldKind, string> = {
  "list-page": "MapoList page with typed columns",
  "detail-page": "MapoDetail page with field descriptors",
  "standalone-form": "MapoForm driven by useCrud and your own submit handler",
  "custom-field": "field component plus the plugin registering its type",
  "login-page": "MapoLogin page wired to the configured auth endpoints",
  "theme-override":
    "CSS token file plus the nuxt.config fragment that loads it",
  "backend-proxy": "Nitro middleware proxying /api/* to a backend",
  "menu-page": "MapoMenuManager page for a navigation tree",
  "media-page": "MapoMediaManager page",
};

/** Kinds that describe a resource and therefore accept fields. */
const RESOURCE_KINDS = new Set<ScaffoldKind>([
  "list-page",
  "detail-page",
  "standalone-form",
]);

export interface ScaffoldOptions {
  kind: ScaffoldKind;
  /** Resource or type name, e.g. `articles` or `star-rating`. */
  name?: string;
  /** REST endpoint; defaults to `/api/<name>`. */
  endpoint?: string;
  /** Route base; defaults to `/<name>`. */
  route?: string;
  /** `key[:type[:label]]` specs. */
  fields?: string[];
  api?: ApiKnowledge;
}

/** `articles` → `Article`; `star-rating` → `StarRating`. */
function toModelName(name: string): string {
  const pascal = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  // Singularise the obvious plurals; anything else stays as written.
  if (/ies$/.test(pascal)) return `${pascal.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/.test(pascal)) return pascal.slice(0, -2);
  if (/[^s]s$/.test(pascal)) return pascal.slice(0, -1);
  return pascal;
}

export function scaffold(options: ScaffoldOptions): TemplateOutput {
  const name = (options.name ?? "items").trim().replace(/^\/+|\/+$/g, "");
  const route = (options.route ?? `/${name}`).replace(/\/+$/, "");
  const endpoint = (options.endpoint ?? `/api/${name}`).replace(/\/+$/, "");

  const fields = RESOURCE_KINDS.has(options.kind)
    ? parseFields(
        options.fields?.length ? options.fields : ["title:text"],
        options.api,
      )
    : [];

  const input: TemplateInput = {
    name,
    model: toModelName(name),
    endpoint,
    route,
    fields,
    ...(options.api ? { api: options.api } : {}),
  };

  switch (options.kind) {
    case "list-page":
      return templates.listPage(input);
    case "detail-page":
      return templates.detailPage(input);
    case "standalone-form":
      return templates.standaloneForm(input);
    case "custom-field":
      return templates.customField(input);
    case "login-page":
      return templates.loginPage();
    case "theme-override":
      return templates.themeOverride();
    case "backend-proxy":
      return templates.backendProxy(input);
    case "menu-page":
      return templates.menuPage(input);
    case "media-page":
      return templates.mediaPage(input);
  }
}

export type { TemplateOutput as ScaffoldResult } from "./templates.js";
export { UnknownFieldTypeError } from "./fields.js";

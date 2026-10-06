/**
 * Loads an OpenAPI document from a URL or a local file.
 *
 * Isolated from the mapping so the mapping stays pure, and from the tool so the
 * failure modes — unreachable backend, HTML login page instead of JSON, YAML
 * where JSON was expected — can be reported in a way the caller can act on.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { OpenApiDocument } from "./openapi.js";

/** Documents change rarely during a session; re-fetching on every call is rude. */
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { at: number; document: OpenApiDocument }>();

export class SchemaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaUnavailableError";
  }
}

function parseDocument(raw: string, origin: string): OpenApiDocument {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    // drf-spectacular serves YAML by default; JSON is one query param away.
    const looksLikeYaml = /^openapi:\s/m.test(trimmed);
    throw new SchemaUnavailableError(
      looksLikeYaml
        ? `${origin} returned YAML. Request JSON instead — drf-spectacular accepts \`?format=json\`.`
        : `${origin} did not return JSON (the response starts with "${trimmed.slice(0, 30)}…"). ` +
            "An HTML page usually means the schema endpoint requires authentication.",
    );
  }

  try {
    return JSON.parse(raw) as OpenApiDocument;
  } catch (error) {
    throw new SchemaUnavailableError(
      `${origin} returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function fetchDocument(
  url: string,
  token: string | null,
): Promise<OpenApiDocument> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    throw new SchemaUnavailableError(
      `Could not reach ${url} (${error instanceof Error ? error.message : String(error)}). ` +
        "Is the backend running?",
    );
  }

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? " The schema endpoint needs credentials: set the token env var declared in `mapo.mcp.backend.tokenEnv`."
        : "";
    throw new SchemaUnavailableError(
      `${url} answered ${response.status}.${hint}`,
    );
  }

  return parseDocument(await response.text(), url);
}

function readDocument(path: string, rootDir: string | null): OpenApiDocument {
  const absolute = isAbsolute(path)
    ? path
    : resolve(rootDir ?? process.cwd(), path);
  if (!existsSync(absolute)) {
    throw new SchemaUnavailableError(`No schema file at ${absolute}.`);
  }
  return parseDocument(readFileSync(absolute, "utf-8"), absolute);
}

export interface LoadSchemaOptions {
  token?: string | null;
  /** Base for relative file paths. */
  rootDir?: string | null;
}

/**
 * `source` is an http(s) URL or a path. Supporting a file means a team can
 * commit an exported schema and work offline, which is also how this is tested.
 */
export async function loadOpenApiDocument(
  source: string,
  { token = null, rootDir = null }: LoadSchemaOptions = {},
): Promise<OpenApiDocument> {
  const cached = cache.get(source);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.document;

  const document = /^https?:\/\//i.test(source)
    ? await fetchDocument(source, token)
    : readDocument(source, rootDir);

  if (!document.components?.schemas) {
    throw new SchemaUnavailableError(
      `${source} is not an OpenAPI document with \`components.schemas\` (found keys: ${Object.keys(document).join(", ") || "none"}).`,
    );
  }

  cache.set(source, { at: Date.now(), document });
  return document;
}

/** Test helper. */
export function clearSchemaCache(): void {
  cache.clear();
}

/** Shared shapes for the bundled knowledge base. */

/** One searchable slice of a documentation page (usually an H2 section). */
export interface DocChunk {
  /** `<path>#<anchor>`, unique across the knowledge base. */
  id: string;
  /** Path relative to the docs root, e.g. `howto/crud-list.md`. */
  path: string;
  /** First path segment: `howto`, `guide`, `uikit`, `modules`, `migration`, `root`. */
  section: string;
  /** Second path segment when present, e.g. `form` for `uikit/form/validation.md`. */
  group?: string;
  /** Owning package, e.g. `@mapomodule/uikit`. */
  pkg?: string;
  /** H1 of the page. */
  title: string;
  /** Heading of this slice (equals `title` for the page preamble). */
  heading: string;
  /** GitHub-style slug of `heading`. */
  anchor: string;
  /** Heading depth: 1 for the preamble, 2 for H2, 3 for H3. */
  level: number;
  /**
   * `reference` marks API tables (props/slots/emits). They answer "what are the
   * props of X" but rarely "how do I do Y", so ranking demotes them unless the
   * query is explicitly about an API surface.
   */
  kind?: "reference";
  /** Raw markdown of the slice, code fences included. */
  text: string;
  /** Symbols mentioned in the slice: `MapoList`, `useCrud`, field types… */
  tags: string[];
}

/** Inverted index: `terms[token] = [chunkIndex, termFrequency][]`. */
export interface Bm25Index {
  terms: Record<string, Array<[number, number]>>;
  /** Token count per chunk, aligned with the `chunks` array. */
  lengths: number[];
  avgLength: number;
  total: number;
}

export interface DocsKnowledge {
  version: number;
  generatedAt: string;
  /** Doc paths are relative to this (repo-relative, informational only). */
  docsRoot: string;
  chunks: DocChunk[];
  index: Bm25Index;
}

/** One entry of a component's public API. */
export interface ApiMember {
  name: string;
  type?: string;
  required?: boolean;
  default?: string;
  description?: string;
}

/** A `Mapo*` component as extracted from its source at build time. */
export interface ComponentApi {
  name: string;
  pkg: string;
  /** Repo-relative source path. */
  file: string;
  description?: string;
  props: ApiMember[];
  events: ApiMember[];
  slots: ApiMember[];
  exposed: ApiMember[];
  /** Documentation sections that talk about this component (`path#anchor`). */
  docs: string[];
}

/** A field `type` accepted by the form registry, with the descriptor it expects. */
export interface FieldTypeApi {
  type: string;
  /** Component the registry maps this type to. */
  component?: string;
  /** Descriptor interface that documents it, e.g. `TextDescriptor`. */
  descriptor?: string;
  description?: string;
  /** `attrs` accepted by this field type. */
  attrs: ApiMember[];
  /** Registry-level default `attrs` merged into every field of this type. */
  defaultAttrs?: Record<string, unknown>;
  /** Whether the registry installs a default get/set accessor for the type. */
  hasAccessor?: boolean;
  docs: string[];
}

/** An auto-imported composable or helper exposed by a Mapo module. */
export interface ComposableApi {
  name: string;
  pkg: string;
  file: string;
  signature?: string;
  description?: string;
  docs: string[];
}

/** Everything extracted from source, shipped next to the docs index. */
export interface ApiKnowledge {
  version: number;
  generatedAt: string;
  components: ComponentApi[];
  fieldTypes: FieldTypeApi[];
  /** Properties every field descriptor accepts, whatever its type. */
  fieldCommon: ApiMember[];
  composables: ComposableApi[];
}

export interface SearchHit {
  id: string;
  path: string;
  section: string;
  title: string;
  heading: string;
  anchor: string;
  score: number;
  snippet: string;
  tags: string[];
}

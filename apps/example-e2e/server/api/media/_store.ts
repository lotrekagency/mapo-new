/**
 * In-memory media store for the example-e2e app.
 * Emulates the Camomilla media-folders explorer contract:
 *   - list (root) and detail (folder) both return { media, folders, parent_folder }
 *   - single media CRUD lives under the media endpoint
 *   - the metadata is translated, and written the way Camomilla writes it
 *     (see `applyMediaWrite`)
 */

/** Languages the media metadata is translated into; the first is the default. */
const MEDIA_LANGUAGES = ["it", "en"];
const DEFAULT_LANGUAGE = "it";
const TRANSLATABLE_FIELDS = ["title", "alt_text", "description"] as const;

type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];
type MockMetadata = Record<TranslatableField, string>;

/** `lang_info` of the media endpoint's OPTIONS, shaped like Camomilla's. */
export const mediaLangInfo = {
  translatable: true,
  languages: MEDIA_LANGUAGES,
  site_languages: MEDIA_LANGUAGES,
  default: DEFAULT_LANGUAGE,
  active: DEFAULT_LANGUAGE,
  translatable_fields: [...TRANSLATABLE_FIELDS],
};

export interface MockMediaItem extends MockMetadata {
  id: number;
  file: string;
  mime_type: string;
  size: number;
  created: string;
  modified: string;
  folder: number | null;
  name?: string;
  /** Per-language metadata; the plain fields mirror the default language. */
  translations: Record<string, MockMetadata>;
}

export interface MockFolder {
  id: number;
  name: string;
  parent: number | null;
  path: string;
}

let mediaIdSeq = 100;
let folderIdSeq = 10;

export const mockFolders: MockFolder[] = [
  { id: 1, name: "Website images", parent: null, path: "website-images" },
  { id: 2, name: "Videos", parent: null, path: "videos" },
  { id: 3, name: "Documents", parent: null, path: "documents" },
  {
    id: 4,
    name: "Hero banners",
    parent: 1,
    path: "website-images/hero-banners",
  },
];

const DEMO_IMAGES = [
  {
    url: "https://picsum.photos/seed/mapo1/400/300",
    mime: "image/jpeg",
    size: 45120,
  },
  {
    url: "https://picsum.photos/seed/mapo2/600/400",
    mime: "image/jpeg",
    size: 78340,
  },
  {
    url: "https://picsum.photos/seed/mapo3/800/600",
    mime: "image/jpeg",
    size: 124500,
  },
  {
    url: "https://picsum.photos/seed/mapo4/300/400",
    mime: "image/jpeg",
    size: 38000,
  },
  {
    url: "https://picsum.photos/seed/mapo5/500/500",
    mime: "image/jpeg",
    size: 65200,
  },
  {
    url: "https://picsum.photos/seed/mapo6/900/600",
    mime: "image/jpeg",
    size: 156000,
  },
  {
    url: "https://picsum.photos/seed/mapo7/400/600",
    mime: "image/jpeg",
    size: 89000,
  },
  {
    url: "https://picsum.photos/seed/mapo8/700/400",
    mime: "image/jpeg",
    size: 110000,
  },
  {
    url: "https://picsum.photos/seed/mapo9/500/300",
    mime: "image/jpeg",
    size: 55000,
  },
  {
    url: "https://picsum.photos/seed/mapo10/600/600",
    mime: "image/jpeg",
    size: 93000,
  },
  {
    url: "https://picsum.photos/seed/mapo11/300/300",
    mime: "image/png",
    size: 42000,
  },
  {
    url: "https://picsum.photos/seed/mapo12/800/400",
    mime: "image/jpeg",
    size: 135000,
  },
];

export const mockMediaItems: MockMediaItem[] = DEMO_IMAGES.map((img, i) => {
  const translations = {
    it: {
      title: `Immagine ${i + 1}`,
      alt_text: `Descrizione alternativa dell'immagine ${i + 1}`,
      description: "",
    },
    en: {
      title: `Image ${i + 1}`,
      alt_text: `Alternative description for image ${i + 1}`,
      description: "",
    },
  };
  return {
    id: i + 1,
    file: img.url,
    mime_type: img.mime,
    ...translations[DEFAULT_LANGUAGE],
    translations,
    size: img.size,
    created: new Date(Date.now() - i * 86400000).toISOString(),
    modified: new Date(Date.now() - i * 43200000).toISOString(),
    folder: i < 4 ? 1 : i < 6 ? 4 : null,
  };
});

const emptyMetadata = (): MockMetadata => ({
  title: "",
  alt_text: "",
  description: "",
});

// Keys a media write never sets directly: the id, the plain translatable
// fields (see `applyMediaWrite`), the file (uploads and replacements set it)
// and the file-replacement flags of the default and the Camomilla adapters.
const NOT_WRITABLE = new Set<string>([
  "id",
  ...TRANSLATABLE_FIELDS,
  "translations",
  "file",
  "maintain_url",
  "same_url",
]);

/**
 * Apply a write the way Camomilla applies it to a translated model: the plain
 * translatable fields are ignored (Camomilla drops them, so a client must send
 * `translations`), `translations` is merged language by language and field by
 * field, and the plain fields mirror the default language again. Every other
 * field is taken as it is.
 */
function applyMediaWrite(item: MockMediaItem, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (NOT_WRITABLE.has(key)) continue;
    (item as unknown as Record<string, unknown>)[key] = value;
  }

  const incoming = (data.translations ?? {}) as Record<
    string,
    Partial<Record<string, unknown>>
  >;
  for (const lang of MEDIA_LANGUAGES) {
    const values = incoming[lang];
    if (!values) continue;
    const target = (item.translations[lang] ??= emptyMetadata());
    for (const field of TRANSLATABLE_FIELDS) {
      const value = values[field];
      if (typeof value === "string") target[field] = value;
    }
  }

  const mirrored = item.translations[DEFAULT_LANGUAGE] ?? emptyMetadata();
  for (const field of TRANSLATABLE_FIELDS) item[field] = mirrored[field];
}

// Camomilla's Media model: title and alt text are CharField(max_length=200).
const MAX_LENGTH: Partial<Record<TranslatableField, number>> = {
  title: 200,
  alt_text: 200,
};

/**
 * Field errors of a write, as a DRF body keyed like Camomilla reports
 * translated fields (`title_it`), or `null` when the write is valid.
 */
export function validateMediaWrite(
  data: Record<string, unknown>,
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  const incoming = (data.translations ?? {}) as Record<
    string,
    Partial<Record<string, unknown>>
  >;
  for (const [lang, values] of Object.entries(incoming)) {
    for (const [field, max] of Object.entries(MAX_LENGTH)) {
      const value = values?.[field];
      const isText = typeof value === "string";
      if (!isText || value.length <= max) continue;
      errors[`${field}_${lang}`] = [
        `Ensure this field has no more than ${max} characters.`,
      ];
    }
  }
  return Object.keys(errors).length ? errors : null;
}

/** The file part of a multipart write: what the mock keeps of an upload. */
export interface UploadedFile {
  name: string;
  type: string;
  size: number;
}

/**
 * The body of a media write, as JSON or as Mapo's multipart envelope: the
 * payload as JSON in the `data` part, the files in parts named by their path.
 */
export async function readMediaWrite(
  event: Parameters<typeof readBody>[0],
): Promise<{ data: Record<string, unknown>; file?: UploadedFile }> {
  const contentType = getRequestHeader(event, "content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  if (!isMultipart) {
    const body = await readBody(event).catch(() => ({}));
    return { data: (body ?? {}) as Record<string, unknown> };
  }

  const parts = (await readMultipartFormData(event)) ?? [];
  const envelope = parts.find((part) => part.name === "data");
  const data = envelope ? JSON.parse(envelope.data.toString("utf8")) : {};
  const upload = parts.find((part) => part.name === "file");
  if (!upload) return { data };
  const file: UploadedFile = {
    name: upload.filename ?? "upload",
    type: upload.type ?? "application/octet-stream",
    size: upload.data.length,
  };
  return { data, file };
}

/**
 * Extract a mime filter from either the canonical `mime` param (default adapter)
 * or the Camomilla `fltr=mime_type=<value>` param (Camomilla adapter).
 */
export function parseMimeFilter(query: Record<string, unknown>): string | null {
  if (query.mime) return String(query.mime);
  const fltr = query.fltr ? String(query.fltr) : "";
  const match = fltr.match(/mime_type=([^&]+)/);
  return match?.[1] ?? null;
}

/**
 * Build the explorer payload for a given folder (or root when `folder` is null).
 * Returns the canonical `{ media, folders, parent_folder }` shape.
 */
export function getExplorer(opts: {
  page?: number;
  pageSize?: number;
  folder?: number | null;
  search?: string;
  mime?: string | null;
}) {
  const { page = 1, pageSize = 20, folder = null, search, mime } = opts;

  let items = mockMediaItems.filter((m) => m.folder === folder);

  if (search) {
    const q = search.toLowerCase();
    items = items.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.alt_text.toLowerCase().includes(q),
    );
  }
  if (mime) {
    const pattern = mime.endsWith("/*") ? mime.replace("/*", "/") : mime;
    items = items.filter((m) => m.mime_type.startsWith(pattern));
  }

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);

  const parentFolder =
    folder != null ? (mockFolders.find((f) => f.id === folder) ?? null) : null;
  const currentFolders = mockFolders.filter((f) => f.parent === folder);

  return {
    media: { items: paginatedItems, paginator: { page, pages } },
    folders: currentFolders,
    parent_folder: parentFolder,
  };
}

// The mock stores no bytes: an upload is shown with a placeholder image.
const placeholderUrl = () => `https://picsum.photos/seed/${Date.now()}/400/300`;

export function addMediaItem(
  data: Record<string, unknown>,
  file?: UploadedFile,
): MockMediaItem {
  const now = new Date().toISOString();
  const item: MockMediaItem = {
    id: ++mediaIdSeq,
    file: placeholderUrl(),
    mime_type: file?.type ?? "image/jpeg",
    ...emptyMetadata(),
    translations: {},
    size: file?.size ?? Math.floor(Math.random() * 100000) + 20000,
    created: now,
    modified: now,
    folder: null,
  };
  applyMediaWrite(item, data);
  item.folder = data.folder ? parseInt(String(data.folder), 10) : null;
  mockMediaItems.push(item);
  return item;
}

export function updateMediaItem(
  id: number,
  data: Record<string, unknown>,
  file?: UploadedFile,
): MockMediaItem | null {
  const existing = mockMediaItems.find((m) => m.id === id);
  if (!existing) return null;
  applyMediaWrite(existing, data);
  if (file) {
    // A replacement keeps the URL only when asked to (`maintain_url` from the
    // default adapter, `same_url` from Camomilla's), like the real backends.
    const keepUrl = Boolean(data.maintain_url ?? data.same_url);
    if (!keepUrl) existing.file = placeholderUrl();
    existing.mime_type = file.type;
    existing.size = file.size;
  }
  existing.modified = new Date().toISOString();
  return existing;
}

export function deleteMediaItem(id: number): boolean {
  const idx = mockMediaItems.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  mockMediaItems.splice(idx, 1);
  return true;
}

export function addFolder(data: Partial<MockFolder>): MockFolder {
  const name = data.name ?? "New folder";
  const folder: MockFolder = {
    id: ++folderIdSeq,
    name,
    parent: data.parent ?? null,
    path: name.toLowerCase().replace(/\s+/g, "-"),
  };
  mockFolders.push(folder);
  return folder;
}

export function updateFolder(
  id: number,
  data: Partial<MockFolder>,
): MockFolder | null {
  const existing = mockFolders.find((f) => f.id === id);
  if (!existing) return null;
  Object.assign(existing, data);
  return existing;
}

export function removeFolder(id: number): boolean {
  const idx = mockFolders.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  mockFolders.splice(idx, 1);
  return true;
}

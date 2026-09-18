/**
 * In-memory media store for the example-e2e app.
 * Emulates the Camomilla media-folders explorer contract:
 *   - list (root) and detail (folder) both return { media, folders, parent_folder }
 *   - single media CRUD lives under the media endpoint
 */

export interface MockMediaItem {
  id: number;
  file: string;
  mime_type: string;
  title: string;
  alt_text: string;
  description: string;
  size: number;
  created: string;
  modified: string;
  folder: number | null;
  name?: string;
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

export const mockMediaItems: MockMediaItem[] = DEMO_IMAGES.map((img, i) => ({
  id: i + 1,
  file: img.url,
  mime_type: img.mime,
  title: `Image ${i + 1}`,
  alt_text: `Alternative description for image ${i + 1}`,
  description: "",
  size: img.size,
  created: new Date(Date.now() - i * 86400000).toISOString(),
  modified: new Date(Date.now() - i * 43200000).toISOString(),
  folder: i < 4 ? 1 : i < 6 ? 4 : null,
}));

/**
 * Extract a mime filter from either the canonical `mime` param (default adapter)
 * or Camomilla's `fltr` (Camomilla adapter), which sends a glob as a prefix
 * match — `fltr=mime_type__startswith=image/` — and a concrete type as an
 * exact `fltr=mime_type=image/png`. Both reduce to the prefix compared below.
 */
export function parseMimeFilter(query: Record<string, unknown>): string | null {
  if (query.mime) return String(query.mime);
  const fltr = query.fltr ? String(query.fltr) : "";
  const match = fltr.match(/mime_type(?:__startswith)?=([^&]+)/);
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

export function addMediaItem(data: Partial<MockMediaItem>): MockMediaItem {
  const item: MockMediaItem = {
    id: ++mediaIdSeq,
    file: data.file ?? "",
    mime_type: data.mime_type ?? "application/octet-stream",
    title: data.title ?? "",
    alt_text: data.alt_text ?? "",
    description: data.description ?? "",
    size: data.size ?? 0,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    folder: data.folder ?? null,
  };
  mockMediaItems.push(item);
  return item;
}

export function updateMediaItem(
  id: number,
  data: Partial<MockMediaItem>,
): MockMediaItem | null {
  const existing = mockMediaItems.find((m) => m.id === id);
  if (!existing) return null;
  Object.assign(existing, data, { modified: new Date().toISOString() });
  return existing;
}

export function deleteMediaItem(id: number): boolean {
  const idx = mockMediaItems.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  mockMediaItems.splice(idx, 1);
  return true;
}

/**
 * Folder write payloads arrive in the Camomilla dialect when the Camomilla
 * media adapter is active (`title`/`updir`/`slug`), or canonical (`name`/`parent`)
 * with the default REST adapter. Accept both so the demo works either way.
 */
interface FolderWritePayload {
  name?: string;
  title?: string;
  parent?: number | null;
  updir?: number | null;
  slug?: string;
}

export function addFolder(data: FolderWritePayload): MockFolder {
  const name = data.title ?? data.name ?? "New folder";
  const folder: MockFolder = {
    id: ++folderIdSeq,
    name,
    parent: data.updir ?? data.parent ?? null,
    path: data.slug ?? name.toLowerCase().replace(/\s+/g, "-"),
  };
  mockFolders.push(folder);
  return folder;
}

export function updateFolder(
  id: number,
  data: FolderWritePayload,
): MockFolder | null {
  const existing = mockFolders.find((f) => f.id === id);
  if (!existing) return null;
  const name = data.title ?? data.name ?? existing.name;
  existing.name = name;
  if (data.updir !== undefined || data.parent !== undefined)
    existing.parent = data.updir ?? data.parent ?? null;
  if (data.slug) existing.path = data.slug;
  return existing;
}

export function removeFolder(id: number): boolean {
  const idx = mockFolders.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  mockFolders.splice(idx, 1);
  return true;
}

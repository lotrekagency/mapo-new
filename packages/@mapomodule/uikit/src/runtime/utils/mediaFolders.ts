import type { TreeItem } from "@nuxt/ui";
import type { MediaFolder } from "../types/media.js";

/** Key of the media root in the folder tree and in the store's folder cache. */
export const ROOT_FOLDER_KEY = "root";

/**
 * Key of a folder in the folder tree and in the store's `folderChildren`
 * cache: its id, or `ROOT_FOLDER_KEY` for the root (`null`).
 */
export function folderKey(id: number | null | undefined): string {
  return id == null ? ROOT_FOLDER_KEY : String(id);
}

/**
 * `folder` with its `parent` as an id, as the store and the folder tree read
 * it. Camomilla serializes a folder's parent (`updir`) as the whole parent
 * folder, and an adapter may hand that object on as `parent`; it is read by
 * its `id` (none is the root).
 */
export function canonicalFolder(folder: MediaFolder): MediaFolder {
  const parent: unknown = folder.parent;
  const isObject = typeof parent === "object";
  const isNull = parent === null;
  if (!isObject || isNull) return folder;
  const parentId = (parent as { id?: number | null }).id ?? null;
  return { ...folder, parent: parentId };
}

/** A node of the folder tree: the root (`folder: null`), a folder, or the placeholder of a branch still loading. */
export interface FolderNode extends TreeItem {
  key: string;
  label: string;
  folder: MediaFolder | null;
  children?: FolderNode[];
  /** Placeholder in a branch whose subfolders are not loaded yet. */
  pending?: boolean;
}

/**
 * The folder tree, from the store's `folderChildren` cache: the root, then the
 * folders. A branch not loaded yet holds one placeholder child, so it shows as
 * expandable; a loaded branch with no subfolders is a leaf. A folder met twice
 * on the same path (a cycle in the backend's data) is not expanded again.
 *
 * `exclude` leaves out folders and everything under them, as a destination
 * picker needs when a folder cannot go inside itself.
 */
export function buildFolderTree(
  folderChildren: Record<string, MediaFolder[]>,
  labels: { root: string; loading: string },
  options: { exclude?: ReadonlySet<number> } = {},
): FolderNode[] {
  const excluded = options.exclude ?? new Set<number>();
  const branch = (
    parentKey: string,
    seen: Set<string>,
  ): FolderNode[] | undefined => {
    const loaded = folderChildren[parentKey];
    if (!loaded) {
      const placeholder: FolderNode = {
        key: `${parentKey}:pending`,
        label: labels.loading,
        folder: null,
        pending: true,
      };
      return [placeholder];
    }
    const shown = loaded.filter((folder) => !excluded.has(folder.id));
    if (!shown.length) return undefined;
    return shown.map((folder) => {
      const key = folderKey(folder.id);
      const isRepeated = seen.has(key);
      const children = isRepeated
        ? undefined
        : branch(key, new Set(seen).add(key));
      return { key, label: folder.name, folder, children };
    });
  };

  const root: FolderNode = {
    key: ROOT_FOLDER_KEY,
    label: labels.root,
    folder: null,
    children: branch(ROOT_FOLDER_KEY, new Set([ROOT_FOLDER_KEY])),
  };
  return [root];
}

/** The node with `key` in the tree, at any depth. */
export function findFolderNode(
  nodes: FolderNode[] | undefined,
  key: string,
): FolderNode | undefined {
  for (const node of nodes ?? []) {
    if (node.key === key) return node;
    const inner = findFolderNode(node.children, key);
    if (inner) return inner;
  }
  return undefined;
}

/** Icon of a tree node: a spinner while loading, an open folder when it shows children. */
export function folderNodeIcon(node: FolderNode, isOpen: boolean): string {
  if (node.pending) return "i-lucide-loader-circle";
  const showsChildren = isOpen && !!node.children?.length;
  return showsChildren ? "i-lucide-folder-open" : "i-lucide-folder";
}

/**
 * The path to folder `id` read from the `folderChildren` cache: its ancestors
 * from the top level down, then the folder itself. `undefined` when the cache
 * cannot place it, or one of its ancestors, or meets a cycle.
 *
 * Breadcrumbs need it once the tree lets the user jump to any folder: a
 * folder opened from another branch is not a child of the one on screen.
 */
export function folderPath(
  folderChildren: Record<string, MediaFolder[]>,
  id: number,
): MediaFolder[] | undefined {
  const parentOf = new Map<number, number | null>();
  const byId = new Map<number, MediaFolder>();
  for (const [key, children] of Object.entries(folderChildren)) {
    const parentId = key === ROOT_FOLDER_KEY ? null : Number(key);
    for (const child of children) {
      parentOf.set(child.id, parentId);
      byId.set(child.id, child);
    }
  }

  const path: MediaFolder[] = [];
  const seen = new Set<number>();
  let currentId: number | null = id;
  while (currentId != null) {
    const folder = byId.get(currentId);
    const isKnown = folder !== undefined;
    const isCycle = seen.has(currentId);
    if (!isKnown || isCycle) return undefined;
    path.unshift(folder);
    seen.add(currentId);
    currentId = parentOf.get(currentId) ?? null;
  }
  return path;
}

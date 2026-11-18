import { describe, expect, it } from "vitest";

import {
  ROOT_FOLDER_KEY,
  buildFolderTree,
  canMoveFolderTo,
  canonicalFolder,
  findFolderNode,
  folderKey,
  folderNodeIcon,
  folderParentId,
  folderPath,
} from "../runtime/utils/mediaFolders";
import type { MediaFolder } from "../runtime/types/media";

const labels = { root: "Media", loading: "Loading..." };
const folder = (id: number, name: string, parent: number | null = null) =>
  ({ id, name, parent }) as MediaFolder;

describe("folderKey", () => {
  it("keys the root and the folders", () => {
    expect(folderKey(null)).toBe(ROOT_FOLDER_KEY);
    expect(folderKey(undefined)).toBe(ROOT_FOLDER_KEY);
    expect(folderKey(4)).toBe("4");
  });
});

describe("buildFolderTree", () => {
  it("shows a loading placeholder under a root not loaded yet", () => {
    const [root] = buildFolderTree({}, labels);
    expect(root?.label).toBe("Media");
    expect(root?.children).toEqual([
      expect.objectContaining({ pending: true, label: "Loading..." }),
    ]);
  });

  it("nests the loaded folders, and marks the unloaded branches expandable", () => {
    const [root] = buildFolderTree(
      {
        root: [folder(1, "Photos"), folder(2, "Videos")],
        1: [folder(3, "Hero", 1)],
        2: [],
      },
      labels,
    );
    const [photos, videos] = root?.children ?? [];
    expect(photos?.label).toBe("Photos");
    // Loaded with a subfolder that is not loaded itself.
    expect(photos?.children?.[0]?.label).toBe("Hero");
    expect(photos?.children?.[0]?.children?.[0]?.pending).toBe(true);
    // Loaded and empty: a leaf.
    expect(videos?.children).toBeUndefined();
  });

  it("stops at a folder already met on the path", () => {
    const [root] = buildFolderTree(
      {
        root: [folder(1, "A")],
        1: [folder(2, "B", 1)],
        2: [folder(1, "A", 2)],
      },
      labels,
    );
    const again = root?.children?.[0]?.children?.[0]?.children?.[0];
    expect(again?.key).toBe("1");
    expect(again?.children).toBeUndefined();
  });

  it("is a leaf root when the library has no folders", () => {
    const [root] = buildFolderTree({ root: [] }, labels);
    expect(root?.children).toBeUndefined();
  });
});

describe("findFolderNode", () => {
  it("finds a node at any depth", () => {
    const tree = buildFolderTree(
      { root: [folder(1, "A")], 1: [folder(2, "B", 1)] },
      labels,
    );
    expect(findFolderNode(tree, "2")?.label).toBe("B");
    expect(findFolderNode(tree, ROOT_FOLDER_KEY)?.label).toBe("Media");
    expect(findFolderNode(tree, "9")).toBeUndefined();
  });
});

describe("buildFolderTree exclude", () => {
  // A destination picker hides a folder with everything under it.
  it("leaves out excluded folders and their subtrees", () => {
    const tree = buildFolderTree(
      {
        root: [folder(1, "A"), folder(2, "B")],
        1: [folder(3, "A1", 1)],
      },
      labels,
      { exclude: new Set([1]) },
    );
    expect(tree[0]?.children?.map((node) => node.label)).toEqual(["B"]);
    expect(findFolderNode(tree, "3")).toBeUndefined();
  });
});

describe("folderNodeIcon", () => {
  it("shows a spinner while loading and an open folder with children", () => {
    const [root] = buildFolderTree({ root: [folder(1, "A")] }, labels);
    expect(folderNodeIcon(root!, true)).toBe("i-lucide-folder-open");
    expect(folderNodeIcon(root!, false)).toBe("i-lucide-folder");
    const pending = root!.children![0]!.children![0]!;
    expect(folderNodeIcon(pending, false)).toBe("i-lucide-loader-circle");
  });
});

describe("folderPath", () => {
  const cache = {
    root: [folder(1, "Photos"), folder(2, "Videos")],
    1: [folder(3, "Hero", 1)],
    3: [folder(4, "Banners", 3)],
  };

  it("reads the ancestors of a nested folder from the cache", () => {
    expect(folderPath(cache, 4)?.map((f) => f.name)).toEqual([
      "Photos",
      "Hero",
      "Banners",
    ]);
  });

  it("places a top-level folder alone", () => {
    expect(folderPath(cache, 2)?.map((f) => f.name)).toEqual(["Videos"]);
  });

  it("gives up on a folder the cache does not know", () => {
    expect(folderPath(cache, 9)).toBeUndefined();
  });

  it("gives up on a cycle", () => {
    const cyclic = { root: [], 1: [folder(2, "B", 1)], 2: [folder(1, "A", 2)] };
    expect(folderPath(cyclic, 1)).toBeUndefined();
  });
});

describe("canonicalFolder", () => {
  // Camomilla serializes the parent (`updir`) as the whole parent folder.
  const nested = (parent: unknown) =>
    ({ id: 3, name: "Hero", parent }) as unknown as MediaFolder;

  it("reads a parent given as an object by its id", () => {
    const parent = { id: 1, title: "Photos", updir: null };
    expect(canonicalFolder(nested(parent))).toEqual(folder(3, "Hero", 1));
  });

  it("reads a parent object without an id as the root", () => {
    expect(canonicalFolder(nested({ title: "" })).parent).toBeNull();
  });

  it("keeps a folder whose parent is already an id or none", () => {
    const top = folder(1, "Photos");
    const child = folder(3, "Hero", 1);
    expect(canonicalFolder(top)).toBe(top);
    expect(canonicalFolder(child)).toBe(child);
  });
});

describe("folderParentId", () => {
  const cache = { root: [folder(1, "Photos")], 1: [folder(3, "Hero")] };

  it("reads the parent from the branch that lists the folder", () => {
    expect(folderParentId(cache, folder(3, "Hero"))).toBe(1);
    expect(folderParentId(cache, folder(1, "Photos", 9))).toBeNull();
  });

  it("falls back to the folder's own parent when no branch lists it", () => {
    expect(folderParentId(cache, folder(5, "Elsewhere", 2))).toBe(2);
    expect(folderParentId(cache, folder(5, "Elsewhere"))).toBeNull();
  });
});

describe("canMoveFolderTo", () => {
  // Root: Photos (1) > Hero (3) > Night (4); Videos (2).
  const cache = {
    root: [folder(1, "Photos"), folder(2, "Videos")],
    1: [folder(3, "Hero", 1)],
    3: [folder(4, "Night", 3)],
  };
  const photos = folder(1, "Photos");
  const hero = folder(3, "Hero", 1);

  it("refuses the folder itself and every folder under it", () => {
    expect(canMoveFolderTo(cache, photos, 1)).toBe(false);
    expect(canMoveFolderTo(cache, photos, 3)).toBe(false);
    expect(canMoveFolderTo(cache, photos, 4)).toBe(false);
  });

  it("refuses the folder it is already in", () => {
    expect(canMoveFolderTo(cache, photos, null)).toBe(false);
    expect(canMoveFolderTo(cache, hero, 1)).toBe(false);
  });

  it("takes any other folder, the root included", () => {
    expect(canMoveFolderTo(cache, photos, 2)).toBe(true);
    expect(canMoveFolderTo(cache, hero, null)).toBe(true);
    expect(canMoveFolderTo(cache, hero, 2)).toBe(true);
  });
});

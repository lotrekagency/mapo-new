import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import type { MediaFolder, MediaItem } from "../runtime/types/media";

const crud = vi.hoisted(() => ({
  options: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  partialUpdate: vi.fn(),
  updateOrCreate: vi.fn(),
  delete: vi.fn(),
}));
const snack = vi.hoisted(() => ({ show: vi.fn() }));
const confirm = vi.hoisted(() => ({ ask: vi.fn() }));
// The app's `mapo.uikit` runtime config, changed by the content-language test.
const runtimeConfig = vi.hoisted(() => ({
  public: { mapoUikit: { contentLanguages: [] as string[] } },
}));

vi.mock("#app", () => ({
  useRuntimeConfig: () => runtimeConfig,
  useNuxtApp: () => ({}),
}));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => snack,
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => confirm,
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

const { useMediaStore } = await import("../runtime/stores/media");

const stored: MediaItem = {
  id: 7,
  file: "/media/photo.jpg",
  mime_type: "image/jpeg",
  title: "Foto",
  alt_text: "",
  description: "",
  size: 1000,
  created: "2026-11-01T00:00:00Z",
  modified: "2026-11-01T00:00:00Z",
  translations: {
    it: { title: "Foto", alt_text: "", description: "" },
    en: { title: "Photo", alt_text: "", description: "" },
  },
};

beforeEach(() => {
  runtimeConfig.public.mapoUikit.contentLanguages = [];
  setActivePinia(createPinia());
  for (const fn of Object.values(crud)) fn.mockReset();
  snack.show.mockReset();
  confirm.ask.mockReset();
  confirm.ask.mockResolvedValue(true);
  crud.list.mockResolvedValue({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders: [],
    parent_folder: null,
  });
});

describe("media store — languages", () => {
  it("uses the endpoint's languages until the host imposes its own", async () => {
    crud.options.mockResolvedValue({
      lang_info: { translatable: true, languages: ["it", "en"] },
    });
    const store = useMediaStore();
    await store.deriveLanguages();
    expect(store.activeLanguages).toEqual(["it", "en"]);

    store.setLanguages(["en"]);
    expect(store.activeLanguages).toEqual(["en"]);
  });

  it("opens on the preferred language when offered, else the first", () => {
    const store = useMediaStore();
    store.setLanguages(["it", "en"]);
    expect(store.initialLanguage).toBe("it");
    store.setLang("en");
    expect(store.initialLanguage).toBe("en");
    store.setLang("de");
    expect(store.initialLanguage).toBe("it");
  });

  it("narrows the languages to the app's content languages", async () => {
    runtimeConfig.public.mapoUikit.contentLanguages = ["it"];
    crud.options.mockResolvedValue({
      lang_info: { translatable: true, languages: ["en", "it"] },
    });
    const store = useMediaStore();
    await store.deriveLanguages();
    expect(store.activeLanguages).toEqual(["it"]);
    expect(store.initialLanguage).toBe("it");

    store.setLanguages(["en", "it"]);
    expect(store.activeLanguages).toEqual(["it"]);
  });

  it("forgets the host's languages on reset", () => {
    const store = useMediaStore();
    store.setLanguages(["en"]);
    store.setLang("en");
    store.reset();
    expect(store.activeLanguages).toEqual([]);
    expect(store.initialLanguage).toBe("");
  });
});

describe("media store — updateMedia", () => {
  it("sends only what changed since editing started", async () => {
    const edited: MediaItem = {
      ...stored,
      translations: {
        ...stored.translations,
        it: { title: "Nuovo titolo", alt_text: "", description: "" },
      },
    };
    crud.partialUpdate.mockResolvedValue(edited);
    const store = useMediaStore();
    store.editMedia = edited;

    await store.updateMedia(edited, stored);

    expect(crud.partialUpdate).toHaveBeenCalledWith(7, {
      translations: { it: { title: "Nuovo titolo" } },
    });
    expect(store.editMedia).toEqual(edited);
    expect(snack.show).toHaveBeenCalledWith(
      "mapo.mediaManager.fileInfo",
      "success",
    );
  });

  it("makes no request when nothing changed, and still refreshes", async () => {
    const store = useMediaStore();
    const replaced = { ...stored, file: "/media/new.jpg" };
    // After a file replacement the editor already shows the server's copy.
    store.editMedia = replaced;

    await store.updateMedia(stored, stored);

    expect(crud.partialUpdate).not.toHaveBeenCalled();
    expect(store.editMedia).toEqual(replaced);
    expect(snack.show).toHaveBeenCalledWith(
      "mapo.mediaManager.fileInfo",
      "success",
    );
    expect(crud.list).toHaveBeenCalled();
  });

  it("shows no success toast when the request fails", async () => {
    crud.partialUpdate.mockRejectedValue(new Error("400"));
    const store = useMediaStore();
    const edited = { ...stored, title: "Changed", translations: undefined };

    await expect(
      store.updateMedia(edited, { ...stored, translations: undefined }),
    ).rejects.toThrow("400");
    expect(snack.show).not.toHaveBeenCalled();
  });
});

describe("media store — breadcrumbs", () => {
  const explorer = (parentFolder: unknown) => ({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders: [],
    parent_folder: parentFolder,
  });

  // Camomilla serializes "no folder" as an empty one; once the adapter has
  // normalized it, it still has no id.
  it("treats a parent folder without id as the root", async () => {
    crud.list.mockResolvedValue(
      explorer({ title: "", updir: null, name: "", parent: null }),
    );
    const store = useMediaStore();

    await store.getRoot({ page: 1 });

    expect(store.parentFolders).toEqual([]);
    expect(store.parentFolder).toBeNull();
  });

  it("enters a real folder and leaves it for the root", async () => {
    const folder = { id: 3, name: "Foto", parent: null, path: "/foto" };
    crud.detail.mockResolvedValue(explorer(folder));
    crud.list.mockResolvedValue(explorer({ title: "", updir: null }));
    const store = useMediaStore();

    await store.navigateToFolder(folder);
    expect(store.parentFolders).toEqual([folder]);

    await store.navigateToFolder(null);
    expect(store.parentFolders).toEqual([]);
  });
});

describe("media store — folder tree cache", () => {
  const explorer = (folders: MediaFolder[], parentFolder: unknown = null) => ({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders,
    parent_folder: parentFolder,
  });
  const photos: MediaFolder = { id: 1, name: "Photos", parent: null };
  const hero: MediaFolder = { id: 3, name: "Hero", parent: 1 };
  const videos: MediaFolder = { id: 2, name: "Videos", parent: null };

  it("keeps the subfolders of every folder it shows", async () => {
    crud.list.mockResolvedValue(explorer([photos, videos]));
    crud.detail.mockResolvedValue(explorer([hero], photos));
    const store = useMediaStore();

    await store.getRoot({ page: 1 });
    await store.navigateToFolder(photos);

    expect(store.folderChildren).toEqual({ root: [photos, videos], 1: [hero] });
  });

  it("does not take a library-wide view for the root's children", async () => {
    crud.list.mockResolvedValue(explorer([photos]));
    const store = useMediaStore();

    await store.getRoot({ page: 1, search: "x", all: true });

    expect(store.folderChildren).toEqual({});
  });

  it("loads a branch without leaving the folder on screen", async () => {
    crud.list.mockResolvedValue(explorer([photos, videos]));
    const store = useMediaStore();
    await store.getRoot({ page: 1 });
    crud.detail.mockResolvedValue(explorer([], videos));

    await store.loadFolderChildren(2);

    expect(crud.detail).toHaveBeenCalledWith(2, { params: { page: 1 } });
    expect(store.folderChildren[2]).toEqual([]);
    expect(store.parentFolders).toEqual([]);
  });

  it("refreshes the branch of a folder renamed outside the one on screen", async () => {
    crud.list.mockResolvedValue(explorer([photos, videos]));
    crud.updateOrCreate.mockResolvedValue({});
    const store = useMediaStore();
    await store.getRoot({ page: 1 });
    crud.detail.mockResolvedValue(
      explorer([{ ...hero, name: "Banner" }], photos),
    );

    await store.updateOrCreateFolder({ ...hero, name: "Banner" });

    expect(crud.detail).toHaveBeenCalledWith(1, { params: { page: 1 } });
    expect(store.folderChildren[1]).toEqual([{ ...hero, name: "Banner" }]);
  });

  it("goes up to the parent when the folder on screen is deleted", async () => {
    crud.detail.mockResolvedValue(explorer([hero], photos));
    crud.delete.mockResolvedValue(undefined);
    const store = useMediaStore();
    await store.navigateToFolder(photos);
    crud.list.mockResolvedValue(explorer([videos]));

    await store.deleteFolder(photos);

    expect(crud.delete).toHaveBeenCalledWith(1);
    expect(store.parentFolders).toEqual([]);
    expect(store.folderChildren).toEqual({ root: [videos] });
  });
});

describe("media store — upload hand-over", () => {
  it("hands queued files over once", () => {
    const store = useMediaStore();
    const first = new File(["a"], "a.png", { type: "image/png" });
    const second = new File(["b"], "b.png", { type: "image/png" });

    store.queueUploads([first]);
    store.queueUploads([second]);

    expect(store.takeQueuedUploads()).toEqual([first, second]);
    expect(store.takeQueuedUploads()).toEqual([]);
  });
});

describe("media store — moveMedia", () => {
  const explorer = {
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders: [],
    parent_folder: null,
  };

  it("moves each media through the adapter, then refreshes", async () => {
    crud.partialUpdate.mockResolvedValue({});
    crud.list.mockResolvedValue(explorer);
    const store = useMediaStore();
    store.editList = [7, 8, 9];

    const moved = await store.moveMedia([7, 8], 3);

    expect(crud.partialUpdate).toHaveBeenCalledWith(7, { folder: 3 });
    expect(crud.partialUpdate).toHaveBeenCalledWith(8, { folder: 3 });
    expect(moved).toEqual([7, 8]);
    expect(store.editList).toEqual([9]);
    expect(snack.show).toHaveBeenCalledWith("mapo.mediaMove.moved", "success");
    expect(crud.list).toHaveBeenCalled();
  });

  it("moves to the root with a null folder", async () => {
    crud.partialUpdate.mockResolvedValue({});
    crud.list.mockResolvedValue(explorer);
    await useMediaStore().moveMedia([7], null);
    expect(crud.partialUpdate).toHaveBeenCalledWith(7, { folder: null });
  });

  it("reports the media that did not move and keeps them selected", async () => {
    crud.partialUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("403"));
    crud.list.mockResolvedValue(explorer);
    const store = useMediaStore();
    store.editList = [7, 8];

    const moved = await store.moveMedia([7, 8], 3);

    expect(moved).toEqual([7]);
    expect(store.editList).toEqual([8]);
    expect(snack.show).toHaveBeenCalledWith("mapo.mediaMove.failed", "error");
  });
});

describe("media store — breadcrumbs across branches", () => {
  const explorer = (folders: MediaFolder[], parentFolder: unknown = null) => ({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders,
    parent_folder: parentFolder,
  });
  const photos: MediaFolder = { id: 1, name: "Photos", parent: null };
  const hero: MediaFolder = { id: 3, name: "Hero", parent: 1 };
  const videos: MediaFolder = { id: 2, name: "Videos", parent: null };

  // The bug it fixes: the tree opens a folder of another branch, and the
  // breadcrumbs used to append it to the path on screen.
  it("shows the path of a folder opened from another branch", async () => {
    crud.list.mockResolvedValue(explorer([photos, videos]));
    const store = useMediaStore();
    await store.getRoot({ page: 1 });
    crud.detail.mockResolvedValueOnce(explorer([hero], photos));
    await store.navigateToFolder(photos);
    crud.detail.mockResolvedValueOnce(explorer([], hero));
    await store.navigateToFolder(hero);
    expect(store.parentFolders.map((f) => f.name)).toEqual(["Photos", "Hero"]);

    crud.detail.mockResolvedValueOnce(explorer([], videos));
    await store.navigateToFolder(videos);

    expect(store.parentFolders.map((f) => f.name)).toEqual(["Videos"]);
  });

  it("falls back to appending a folder the cache cannot place", async () => {
    const stranger: MediaFolder = { id: 9, name: "Elsewhere", parent: 42 };
    crud.detail.mockResolvedValueOnce(explorer([], stranger));
    const store = useMediaStore();

    await store.navigateToFolder(stranger);

    expect(store.parentFolders).toEqual([stranger]);
  });
});

describe("media store — a parent folder given as an object", () => {
  const explorer = (folders: unknown[], parentFolder: unknown = null) => ({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders,
    parent_folder: parentFolder,
  });
  // As the Camomilla adapter hands a subfolder over: its `parent` is the
  // parent folder itself (Camomilla's nested `updir`).
  const photos = { id: 1, name: "Photos", parent: null };
  const hero = {
    id: 3,
    name: "Hero",
    parent: { id: 1, title: "Photos", updir: null },
  };

  it("keeps the folders with their parent as an id", async () => {
    crud.detail.mockResolvedValue(explorer([hero], photos));
    const store = useMediaStore();

    await store.navigateToFolder(photos);

    expect(store.folderChildren[1]?.[0]?.parent).toBe(1);
  });

  it("refreshes the parent's branch after renaming a subfolder", async () => {
    crud.list.mockResolvedValue(explorer([photos]));
    crud.detail.mockResolvedValue(explorer([hero], photos));
    crud.updateOrCreate.mockResolvedValue({});
    const store = useMediaStore();
    await store.getRoot({ page: 1 });
    await store.loadFolderChildren(1);
    const cached = store.folderChildren[1]?.[0] as MediaFolder;

    await store.updateOrCreateFolder({ ...cached, name: "Banner" });

    expect(crud.updateOrCreate).toHaveBeenCalledWith({
      id: 3,
      name: "Banner",
      parent: 1,
    });
    expect(crud.detail).toHaveBeenLastCalledWith(1, { params: { page: 1 } });
  });

  it("goes up to the parent after deleting the subfolder on screen", async () => {
    crud.detail.mockResolvedValue(explorer([], hero));
    crud.delete.mockResolvedValue(undefined);
    const store = useMediaStore();
    await store.navigateToFolder({ id: 3, name: "Hero" });

    await store.deleteFolder(store.parentFolder as MediaFolder);

    expect(crud.delete).toHaveBeenCalledWith(3);
    expect(crud.detail).toHaveBeenLastCalledWith(1, { params: { page: 1 } });
  });
});

describe("media store — moveFolder", () => {
  const explorer = (folders: MediaFolder[], parentFolder: unknown = null) => ({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders,
    parent_folder: parentFolder,
  });
  const photos: MediaFolder = { id: 1, name: "Photos", parent: null };
  const videos: MediaFolder = { id: 2, name: "Videos", parent: null };
  const hero: MediaFolder = { id: 3, name: "Hero", parent: 1 };
  const moved: MediaFolder = { ...hero, parent: 2 };
  // The folders endpoint once Hero has moved under Videos.
  const afterMove: Record<number, unknown> = {
    1: explorer([], photos),
    2: explorer([moved], videos),
    3: explorer([], moved),
  };
  const backendAfterMove = (id: number) => Promise.resolve(afterMove[id]);

  it("saves the folder under its new parent, then reloads both branches", async () => {
    crud.list.mockResolvedValue(explorer([photos, videos]));
    crud.updateOrCreate.mockResolvedValue(moved);
    crud.detail.mockImplementation(backendAfterMove);
    const store = useMediaStore();
    await store.getRoot({ page: 1 });

    const ok = await store.moveFolder(hero, 2);

    expect(ok).toBe(true);
    expect(crud.updateOrCreate).toHaveBeenCalledWith(moved);
    expect(store.folderChildren[1]).toEqual([]);
    expect(store.folderChildren[2]).toEqual([moved]);
    expect(snack.show).toHaveBeenCalledWith(
      "mapo.mediaMove.folderMoved",
      "success",
    );
  });

  it("follows the folder on screen to its new place", async () => {
    crud.list.mockResolvedValue(explorer([photos, videos]));
    crud.detail
      .mockResolvedValueOnce(explorer([hero], photos))
      .mockResolvedValueOnce(explorer([], hero));
    const store = useMediaStore();
    await store.getRoot({ page: 1 });
    await store.navigateToFolder(photos);
    await store.navigateToFolder(hero);
    crud.updateOrCreate.mockResolvedValue(moved);
    crud.detail.mockImplementation(backendAfterMove);

    await store.moveFolder(hero, 2);

    expect(store.parentFolders.map((f) => f.name)).toEqual(["Videos", "Hero"]);
  });

  it("makes no request for a folder that stays where it is", async () => {
    const ok = await useMediaStore().moveFolder(hero, 1);

    expect(ok).toBe(false);
    expect(crud.updateOrCreate).not.toHaveBeenCalled();
  });

  it("reports a folder the backend refused, and reloads nothing", async () => {
    crud.updateOrCreate.mockRejectedValue(new Error("400"));

    const ok = await useMediaStore().moveFolder(hero, 2);

    expect(ok).toBe(false);
    expect(snack.show).toHaveBeenCalledWith(
      "mapo.mediaMove.folderFailed",
      "error",
    );
    expect(crud.detail).not.toHaveBeenCalled();
    expect(crud.list).not.toHaveBeenCalled();
  });

  // Camomilla does not check it, and recurses: the store refuses it even
  // from a caller that skips the picker.
  it("refuses to move a folder into itself or one of its subfolders", async () => {
    const store = useMediaStore();
    store.folderChildren = { root: [photos, videos], 1: [hero] };

    expect(await store.moveFolder(photos, 1)).toBe(false);
    expect(await store.moveFolder(photos, 3)).toBe(false);

    expect(crud.updateOrCreate).not.toHaveBeenCalled();
    expect(snack.show).toHaveBeenCalledWith(
      "mapo.mediaMove.folderFailed",
      "error",
    );
  });

  // Until the branches reload, the tree shows the folder in its old place:
  // a second move picked from it could close a cycle.
  it("moves one folder at a time", async () => {
    let accept: (value: unknown) => void = () => {};
    crud.updateOrCreate.mockReturnValueOnce(
      new Promise((resolve) => (accept = resolve)),
    );
    crud.detail.mockImplementation(backendAfterMove);
    const store = useMediaStore();
    store.folderChildren = { root: [photos, videos], 1: [hero] };

    const first = store.moveFolder(hero, 2);
    expect(store.movingFolderId).toBe(3);
    expect(await store.moveFolder(videos, 1)).toBe(false);
    accept(moved);

    expect(await first).toBe(true);
    expect(crud.updateOrCreate).toHaveBeenCalledTimes(1);
    expect(store.movingFolderId).toBeNull();
  });

  it("takes the old parent from the tree when the folder has none", async () => {
    const bare: MediaFolder = { id: 3, name: "Hero" };
    crud.updateOrCreate.mockResolvedValue(moved);
    crud.detail.mockImplementation(backendAfterMove);
    const store = useMediaStore();
    store.folderChildren = { root: [photos, videos], 1: [bare] };

    await store.moveFolder(bare, 2);

    expect(crud.detail).toHaveBeenCalledWith(1, { params: { page: 1 } });
    expect(crud.detail).toHaveBeenCalledWith(2, { params: { page: 1 } });
  });

  it("leaves no branch showing the folder in its old place", async () => {
    crud.updateOrCreate.mockResolvedValue(moved);
    crud.detail.mockRejectedValue(new Error("network"));
    const store = useMediaStore();
    store.folderChildren = { root: [photos, videos], 1: [hero], 2: [] };

    expect(await store.moveFolder(hero, 2)).toBe(true);

    // The old branch drops it; the new one, not reloaded, loads again later.
    expect(store.folderChildren[1]).toEqual([]);
    expect(store.folderChildren[2]).toBeUndefined();
  });
});

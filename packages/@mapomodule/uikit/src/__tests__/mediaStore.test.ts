import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import type { MediaItem } from "../runtime/types/media";

const crud = vi.hoisted(() => ({
  options: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  partialUpdate: vi.fn(),
}));
const snack = vi.hoisted(() => ({ show: vi.fn() }));
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

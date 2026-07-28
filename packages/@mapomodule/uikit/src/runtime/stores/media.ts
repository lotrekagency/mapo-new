import { defineStore } from "pinia";
import { ref, computed, shallowRef } from "vue";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import { useMapoT } from "@mapomodule/i18n/runtime/composables/useMapoT";
import { useNuxtApp, useRuntimeConfig } from "#app";
import { defaultMediaAdapter } from "../adapters/defaultMediaAdapter.js";
import type {
  MediaItem,
  MediaFolder,
  MediaApiResponse,
  MediaGetRootParams,
  MediaUploadPayload,
  MediaAdapter,
  MediaEndpoints,
  SelectMode,
} from "../types/media.js";

export const useMediaStore = defineStore("mapo-media", () => {
  // ─── Config (endpoints) ─────────────────────────────────────────────────
  const runtimeConfig = useRuntimeConfig();
  const mediaConfig = (runtimeConfig.public.mapoMedia ?? {}) as {
    endpoints?: Partial<MediaEndpoints>;
  };
  const endpoints: MediaEndpoints = {
    media: mediaConfig.endpoints?.media ?? "/api/media",
    folders: mediaConfig.endpoints?.folders ?? "/api/media-folders",
  };

  // Adapter: backend-specific request/response transforms. Provided by a plugin
  // ($mapoMediaAdapter); falls back to plain REST when none is registered.
  function adapter(): MediaAdapter {
    const nuxt = useNuxtApp() as unknown as {
      $mapoMediaAdapter?: MediaAdapter;
    };
    return nuxt.$mapoMediaAdapter ?? defaultMediaAdapter;
  }

  // ─── State ────────────────────────────────────────────────────────────────
  const medias = ref<MediaItem[]>([]);
  const folders = ref<MediaFolder[]>([]);
  const parentFolders = ref<MediaFolder[]>([]);
  const page = ref(1);
  const pages = ref(1);
  const mimeType = ref<string | null>(null);
  /**
   * Mime constraint imposed by the host (e.g. an `image/*` picker field).
   * When set, the folders panel only offers matching filters and `mimeType`
   * cannot be cleared below the lock — a picker must never leak other types.
   */
  const lockedMime = ref<string | null>(null);
  const loading = ref(false);
  const editMedia = ref<MediaItem | null>(null);
  const selection = shallowRef<MediaItem | MediaItem[] | null>(null);
  const editList = ref<number[]>([]);
  const selectMode = ref<SelectMode>("none");

  // ─── Internal navigation context ────────────────────────────────────────
  const _currentFolderId = ref<number | null>(null);
  const _currentSearch = ref<string>("");
  // Whether the current view spans the whole library (global search / mime
  // filter) instead of the current folder. Persisted so pagination keeps the
  // same scope as the request that produced page 1.
  const _currentAll = ref(false);
  const _currentLang = ref<string | undefined>(undefined);

  // ─── Getters ──────────────────────────────────────────────────────────────
  const parentFolder = computed(
    () => parentFolders.value[parentFolders.value.length - 1] ?? null,
  );

  const editListSet = computed(() => new Set(editList.value));

  const editListState = computed<{
    value: boolean;
    indeterminate: boolean;
    outside: boolean;
  }>(() => {
    const total = medias.value.length;
    const selected = editList.value.filter((id) =>
      medias.value.some((m) => m.id === id),
    ).length;
    if (total === 0 || selected === 0)
      return {
        value: false,
        indeterminate: false,
        outside: editList.value.length > 0,
      };
    if (selected === total)
      return { value: true, indeterminate: false, outside: false };
    return { value: false, indeterminate: true, outside: false };
  });

  // ─── CRUD helpers ─────────────────────────────────────────────────────────
  function mediaCrud() {
    return useCrud<MediaItem>(endpoints.media);
  }
  function folderCrud() {
    return useCrud<MediaFolder>(endpoints.folders);
  }

  // ─── Breadcrumb maintenance ─────────────────────────────────────────────
  // Driven by the response's `parent_folder` (matches the legacy contract):
  // push when entering a new folder, slice when navigating back up.
  function applyParentFolder(pf: MediaFolder | null): void {
    if (!pf) {
      parentFolders.value = [];
      return;
    }
    const key = pf.path ?? pf.id;
    const idx = parentFolders.value.findIndex((f) => (f.path ?? f.id) === key);
    if (idx === -1) {
      parentFolders.value = [...parentFolders.value, pf];
    } else {
      parentFolders.value = parentFolders.value.slice(0, idx + 1);
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Fetch the current folder contents. Root (`folderId === null`) → `list()`,
   * inside a folder → `detail(folderId)` on the folders endpoint. Both return
   * the canonical `{ media, folders, parent_folder }` shape (after the adapter
   * normalizes it).
   */
  async function getRoot(params: MediaGetRootParams = {}): Promise<void> {
    loading.value = true;
    if (params.search !== undefined) _currentSearch.value = params.search;
    if (params.all !== undefined) _currentAll.value = params.all;

    const all = _currentAll.value;
    const folderId = all ? null : _currentFolderId.value;

    try {
      const a = adapter();
      const listParams = (
        a.buildListParams ?? defaultMediaAdapter.buildListParams
      )({
        page: params.page ?? page.value,
        search: _currentSearch.value || undefined,
        mime: mimeType.value,
        all: all || undefined,
      });

      const crud = folderCrud();
      const raw =
        folderId != null
          ? await crud.detail(folderId, { params: listParams })
          : await crud.list(listParams as never);

      const data = (
        a.parseRootResponse ?? defaultMediaAdapter.parseRootResponse
      )(raw) as MediaApiResponse;

      medias.value = data.media.items;
      page.value = data.media.paginator.page;
      pages.value = data.media.paginator.pages;
      folders.value = data.folders;
      applyParentFolder(data.parent_folder);
    } finally {
      loading.value = false;
    }
  }

  async function navigateToFolder(folder: MediaFolder | null): Promise<void> {
    _currentFolderId.value = folder?.id ?? null;
    _currentSearch.value = "";
    _currentAll.value = false;
    await getRoot({ page: 1 });
  }

  async function openEditor(media: MediaItem): Promise<void> {
    try {
      const a = adapter();
      const params = (
        a.buildDetailParams ?? defaultMediaAdapter.buildDetailParams
      )({ lang: _currentLang.value });
      const detail = await mediaCrud().detail(media.id, { params });
      editMedia.value = detail;
    } catch {
      editMedia.value = media;
    }
  }

  function closeEditor(): void {
    editMedia.value = null;
  }

  function setLang(lang: string | undefined): void {
    _currentLang.value = lang;
  }

  async function updateMedia(media: MediaItem): Promise<MediaItem> {
    const a = adapter();
    const payload = (
      a.buildMediaPatchPayload ?? defaultMediaAdapter.buildMediaPatchPayload
    )(media);
    const updated = await mediaCrud().partialUpdate(media.id, payload as never);
    // Keep the open editor in sync with the server response (legacy behavior).
    if (editMedia.value?.id === media.id) editMedia.value = updated;
    useSnackStore().show(useMapoT()("mapo.mediaManager.fileInfo"), "success");
    await getRoot();
    return updated;
  }

  async function replaceFile(
    mediaId: number,
    file: File,
    maintainUrl = false,
  ): Promise<MediaItem> {
    const a = adapter();
    const payload = (
      a.buildReplaceFilePayload ?? defaultMediaAdapter.buildReplaceFilePayload
    )(file, maintainUrl);
    const updated = await mediaCrud().partialUpdate(
      mediaId,
      payload as never,
      undefined,
      { multipart: "force" },
    );
    if (editMedia.value?.id === mediaId) editMedia.value = updated;
    return updated;
  }

  async function updateOrCreateFolder(
    folder: Partial<MediaFolder>,
  ): Promise<void> {
    const a = adapter();
    const payload = (
      a.buildFolderPayload ?? defaultMediaAdapter.buildFolderPayload
    )({
      parent: _currentFolderId.value,
      ...folder,
    });
    await folderCrud().updateOrCreate(payload as never);
    await getRoot();
  }

  async function deleteFolder(folder: MediaFolder): Promise<void> {
    const t = useMapoT();
    const confirmed = await useConfirmStore().ask({
      title: t("mapo.mediaFolders.deleteTitle"),
      message: t("mapo.mediaFolders.confirmDelete", { name: folder.name }),
      confirmText: t("mapo.delete"),
      dangerous: true,
    });
    if (!confirmed) return;
    await folderCrud().delete(folder.id);
    await getRoot();
  }

  async function deleteMedia(media: MediaItem): Promise<void> {
    const t = useMapoT();
    const confirmed = await useConfirmStore().ask({
      title: t("mapo.mediaManager.deleteTitle"),
      message: t("mapo.mediaEditor.confirmDelete", {
        name: media.title || media.file,
      }),
      confirmText: t("mapo.delete"),
      dangerous: true,
    });
    if (!confirmed) return;
    await mediaCrud().delete(media.id);
    if (editMedia.value?.id === media.id) editMedia.value = null;
    await getRoot();
  }

  function select(media: MediaItem): void {
    if (selectMode.value === "none") {
      openEditor(media);
      return;
    }
    if (selectMode.value === "single") {
      selection.value = media;
      return;
    }
    // multi
    const current = (selection.value as MediaItem[]) ?? [];
    const idx = current.findIndex((m) => m.id === media.id);
    selection.value =
      idx === -1
        ? [...current, media]
        : current.filter((m) => m.id !== media.id);
  }

  function setSelectionMode(mode: SelectMode): void {
    selectMode.value = mode;
    selection.value = mode === "multi" ? [] : null;
  }

  function setSelection(value: MediaItem | MediaItem[] | null): void {
    selection.value = value;
  }

  function editSelect(id: number | number[]): void {
    const ids = Array.isArray(id) ? id : [id];
    const set = new Set(editList.value);
    for (const i of ids) {
      if (set.has(i)) set.delete(i);
      else set.add(i);
    }
    editList.value = Array.from(set);
  }

  function editSelectAll(): void {
    const allIds = medias.value.map((m) => m.id);
    const allSelected = allIds.every((id) => editListSet.value.has(id));
    if (allSelected) {
      editList.value = editList.value.filter((id) => !allIds.includes(id));
    } else {
      const set = new Set([...editList.value, ...allIds]);
      editList.value = Array.from(set);
    }
  }

  async function deleteSelected(): Promise<void> {
    const count = editList.value.length;
    if (count === 0) return;
    const t = useMapoT();
    const confirmed = await useConfirmStore().ask({
      title: t("mapo.mediaGallery.deleteTitle"),
      message: t("mapo.mediaGallery.deleteSelected", { number: count }),
      confirmText: t("mapo.delete"),
      dangerous: true,
    });
    if (!confirmed) return;
    await Promise.all(editList.value.map((id) => mediaCrud().delete(id)));
    editList.value = [];
    useSnackStore().show(
      t("mapo.mediaGallery.deleteSuccess", { number: count }),
      "success",
    );
    await getRoot();
  }

  async function uploadMedia(
    payload: MediaUploadPayload,
    onProgress?: (percent: number) => void,
  ): Promise<MediaItem> {
    const formData = new FormData();
    formData.append("file", payload.file);
    if (payload.title) formData.append("title", payload.title);
    if (payload.alt_text) formData.append("alt_text", payload.alt_text);
    if (payload.description)
      formData.append("description", payload.description);
    if (payload.folder != null)
      formData.append("folder", String(payload.folder));

    // ofetch has no upload-progress hook, so uploads go through XHR.
    // Same-origin request: the session cookie is attached automatically.
    return await new Promise<MediaItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${endpoints.media.replace(/\/+$/, "")}/`);
      xhr.responseType = "json";
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable)
            onProgress(Math.round((event.loaded / event.total) * 100));
        });
      }
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as MediaItem);
        } else {
          const detail = (xhr.response as { detail?: string } | null)?.detail;
          reject(
            new Error(
              detail ||
                `${useMapoT()("mapo.mediaUploader.uploadFailed")} (${xhr.status})`,
            ),
          );
        }
      });
      xhr.addEventListener("error", () =>
        reject(new Error(useMapoT()("mapo.mediaUploader.uploadFailed"))),
      );
      xhr.send(formData);
    });
  }

  function setMimeType(mime: string | null): void {
    // A locked picker can narrow the filter but never widen it past the lock.
    mimeType.value = mime ?? lockedMime.value;
  }

  function lockMimeType(mime: string | null): void {
    lockedMime.value = mime;
    if (mime) mimeType.value = mime;
  }

  function reset(): void {
    medias.value = [];
    folders.value = [];
    parentFolders.value = [];
    page.value = 1;
    pages.value = 1;
    mimeType.value = null;
    lockedMime.value = null;
    loading.value = false;
    editMedia.value = null;
    selection.value = null;
    editList.value = [];
    selectMode.value = "none";
    _currentFolderId.value = null;
    _currentSearch.value = "";
    _currentAll.value = false;
  }

  return {
    // state
    medias,
    folders,
    parentFolders,
    page,
    pages,
    mimeType,
    lockedMime,
    loading,
    editMedia,
    selection,
    editList,
    selectMode,
    // getters
    parentFolder,
    editListSet,
    editListState,
    // actions
    getRoot,
    navigateToFolder,
    openEditor,
    closeEditor,
    setLang,
    updateMedia,
    replaceFile,
    updateOrCreateFolder,
    deleteFolder,
    deleteMedia,
    select,
    setSelectionMode,
    setSelection,
    editSelect,
    editSelectAll,
    deleteSelected,
    uploadMedia,
    setMimeType,
    lockMimeType,
    reset,
  };
});

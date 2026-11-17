import { defineStore } from "pinia";
import { ref, computed, shallowRef } from "vue";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { normalizeEndpoint } from "@mapomodule/utils";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import { useMapoT } from "@mapomodule/i18n/runtime/composables/useMapoT";
import { applyMultipartPolicy } from "@mapomodule/core/runtime/api/multipart";
import { useNuxtApp, useRuntimeConfig } from "#app";
import { defaultMediaAdapter } from "../adapters/defaultMediaAdapter.js";
import {
  languagesFromMetadata,
  pickLanguage,
  restrictLanguages,
} from "../utils/langInfo.js";
import { useContentLanguages } from "../utils/contentLanguages.js";
import { buildUploadBody } from "../utils/mediaMetadata.js";
import { folderKey, folderPath } from "../utils/mediaFolders.js";
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

  /**
   * Absolute-from-origin URL for the upload POST.
   *
   * Every other media request goes through `useCrud` → `$mapoFetch`, which
   * inherits `baseURL: app.baseURL` from Nuxt's global `$fetch`. The upload has
   * to use XHR (ofetch exposes no upload-progress hook), so it must reproduce
   * that resolution itself: `normalizeEndpoint` for the path (same call
   * `useCrud` makes) plus the app base. Skipping the base made the upload the
   * only request to miss it, so on a sub-path deployment it bypassed server
   * middleware mounted under that base — including the proxy that attaches
   * `X-CSRFToken`, hence 403s on session-authenticated backends.
   */
  function uploadUrl(): string {
    const app = runtimeConfig.app as { baseURL?: string } | undefined;
    const base = (app?.baseURL ?? "/").replace(/\/+$/, "");
    return `${base}${normalizeEndpoint(endpoints.media)}`;
  }

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
  /**
   * Subfolders of every folder seen so far, keyed by `folderKey` (the folder
   * id, `"root"` for the top level). The folder tree reads it: a branch shows
   * what is cached and loads the rest when it opens.
   */
  const folderChildren = ref<Record<string, MediaFolder[]>>({});
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
  /**
   * Files handed to the uploader from outside it (dropped on the gallery,
   * picked with "Upload here"): it queues them, for the folder on screen,
   * when it opens.
   */
  const queuedUploads = shallowRef<File[]>([]);

  // ─── Internal navigation context ────────────────────────────────────────
  const _currentFolderId = ref<number | null>(null);
  const _currentSearch = ref<string>("");
  // Whether the current view spans the whole library (global search / mime
  // filter) instead of the current folder. Persisted so pagination keeps the
  // same scope as the request that produced page 1.
  const _currentAll = ref(false);
  const _currentLang = ref<string | undefined>(undefined);

  // Language codes the media model is actually registered for, read once from
  // the endpoint's OPTIONS. It lives here rather than in the editor because all
  // three entry points — manager, picker dialog, and the `media` form field —
  // mount their own editor, and each would otherwise need the host page to hand
  // it a hardcoded list.
  const languages = ref<string[]>([]);
  let languagesPromise: Promise<void> | null = null;
  // The host's own list (the manager's `languages` prop). Kept here, not in
  // the editor, so the editor and the uploader always work on the same list.
  const languageOverride = ref<string[]>([]);

  // The app's `mapo.uikit.contentLanguages`, read once with the config.
  const contentLanguages = useContentLanguages();

  // ─── Getters ──────────────────────────────────────────────────────────────
  /**
   * Languages the metadata is edited and uploaded in: the host's list, else
   * the endpoint's, narrowed to the app's content languages.
   */
  const activeLanguages = computed(() =>
    restrictLanguages(
      languageOverride.value.length ? languageOverride.value : languages.value,
      contentLanguages,
    ),
  );

  /**
   * Language the editor opens on and uploads write into: the preferred one
   * (`setLang`) when offered, else the first. `""` when media are not
   * translated.
   */
  const initialLanguage = computed(() =>
    pickLanguage(activeLanguages.value, _currentLang.value),
  );

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

  /**
   * Ask the media endpoint to describe its language situation, at most once.
   *
   * `lang_info` is served on OPTIONS only: it describes the model, so there is
   * no record to read it from, and a media library nobody registered for
   * translation reports none — which is the point. The in-flight promise is
   * kept so several editors mounting at once share a single request.
   */
  async function deriveLanguages(): Promise<void> {
    if (languagesPromise) return languagesPromise;
    languagesPromise = (async () => {
      try {
        languages.value = languagesFromMetadata(await mediaCrud().options());
      } catch {
        // A backend without OPTIONS metadata just gets no language switcher.
        languagesPromise = null;
      }
    })();
    return languagesPromise;
  }

  // ─── Breadcrumb maintenance ─────────────────────────────────────────────
  // Driven by the response's `parent_folder` (matches the legacy contract).
  // The folder tree lets the user jump to any folder, so the path is read from
  // the folder cache the tree fills; only a folder the cache cannot place
  // falls back to the legacy rule: push when entering, slice when going back.
  function applyParentFolder(pf: MediaFolder | null): void {
    // A folder without an id is the root too. Camomilla answers the root with
    // an empty folder (`{ title: "", updir: null }`, DRF's serialization of no
    // instance) rather than null; kept, it became a nameless breadcrumb and a
    // "back to root" button on the root itself.
    const isRoot = pf?.id == null;
    if (isRoot) {
      parentFolders.value = [];
      return;
    }
    const cachedPath = folderPath(folderChildren.value, pf.id);
    if (cachedPath) {
      // The response's copy of the folder itself is the fresh one.
      parentFolders.value = [...cachedPath.slice(0, -1), pf];
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
      // A library-wide view (search, mime filter) lists no folder's children.
      if (!all) setFolderChildren(folderId, data.folders);
      applyParentFolder(data.parent_folder);
    } finally {
      loading.value = false;
    }
  }

  function setFolderChildren(id: number | null, children: MediaFolder[]) {
    folderChildren.value = {
      ...folderChildren.value,
      [folderKey(id)]: children,
    };
  }

  /**
   * Load the subfolders of folder `id` (the root when `null`) into
   * `folderChildren`, for the folder tree. It reads the same explorer
   * endpoint as navigation, without changing the folder on screen.
   */
  async function loadFolderChildren(id: number | null): Promise<void> {
    const a = adapter();
    const params = (a.buildListParams ?? defaultMediaAdapter.buildListParams)({
      page: 1,
    });
    const crud = folderCrud();
    const raw =
      id != null
        ? await crud.detail(id, { params })
        : await crud.list(params as never);
    const data = (a.parseRootResponse ?? defaultMediaAdapter.parseRootResponse)(
      raw,
    ) as MediaApiResponse;
    setFolderChildren(id, data.folders);
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

  /** Impose the metadata languages instead of reading them from the endpoint; empty clears it. */
  function setLanguages(langs: string[] | undefined): void {
    languageOverride.value = langs ?? [];
  }

  /**
   * Save the metadata of `media`. With `previous`, the media as it was when
   * editing started, the default adapter sends only what changed; when nothing
   * did, no request is made.
   */
  async function updateMedia(
    media: MediaItem,
    previous?: MediaItem,
  ): Promise<MediaItem> {
    const a = adapter();
    const payload = (
      a.buildMediaPatchPayload ?? defaultMediaAdapter.buildMediaPatchPayload
    )(media, previous);
    let updated = media;
    const hasChanges = Object.keys(payload).length > 0;
    if (hasChanges) {
      updated = await mediaCrud().partialUpdate(media.id, payload as never);
      // Keep the open editor in sync with the server response (legacy behavior).
      if (editMedia.value?.id === media.id) editMedia.value = updated;
    }
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

  /**
   * Move media to folder `folderId` (the root when `null`), one PATCH each
   * through the adapter. Reports how many moved and how many did not, drops
   * the moved ones from the bulk selection and refreshes the folder on
   * screen. Returns the ids that moved.
   */
  async function moveMedia(
    ids: number[],
    folderId: number | null,
  ): Promise<number[]> {
    const a = adapter();
    const payload = (
      a.buildMoveMediaPayload ?? defaultMediaAdapter.buildMoveMediaPayload
    )(folderId);
    const results = await Promise.allSettled(
      ids.map((id) => mediaCrud().partialUpdate(id, payload as never)),
    );
    const moved = ids.filter((_, i) => results[i]?.status === "fulfilled");
    const notMoved = ids.length - moved.length;

    const t = useMapoT();
    const snack = useSnackStore();
    if (moved.length) {
      snack.show(
        t("mapo.mediaMove.moved", { number: moved.length }),
        "success",
      );
    }
    if (notMoved) {
      snack.show(t("mapo.mediaMove.failed", { number: notMoved }), "error");
    }
    editList.value = editList.value.filter((id) => !moved.includes(id));
    await getRoot();
    return moved;
  }

  async function updateOrCreateFolder(
    folder: Partial<MediaFolder>,
  ): Promise<void> {
    const a = adapter();
    const target = { parent: _currentFolderId.value, ...folder };
    const payload = (
      a.buildFolderPayload ?? defaultMediaAdapter.buildFolderPayload
    )(target);
    await folderCrud().updateOrCreate(payload as never);
    await getRoot();
    // The tree can rename a folder outside the one on screen: refresh the
    // branch it lives in too.
    const parentId = target.parent ?? null;
    const isElsewhere = parentId !== _currentFolderId.value;
    if (isElsewhere) await loadFolderChildren(parentId);
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

    const parentId = folder.parent ?? null;
    const remaining = { ...folderChildren.value };
    delete remaining[folderKey(folder.id)];
    folderChildren.value = remaining;
    // The folder on screen, or one above it, is gone: show its parent.
    const isOnPath = parentFolders.value.some((f) => f.id === folder.id);
    if (isOnPath) {
      await navigateToFolder(
        parentId == null ? null : { id: parentId, name: "" },
      );
      return;
    }
    await getRoot();
    const isElsewhere = parentId !== _currentFolderId.value;
    if (isElsewhere) await loadFolderChildren(parentId);
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
    // Translated media take their metadata as a translation, and only the
    // endpoint's OPTIONS says whether they are: wait for that answer.
    await deriveLanguages();
    const body = buildUploadBody(payload, initialLanguage.value || undefined);
    // Build the body through the same multipart pipeline every other write uses
    // (`data` JSON envelope + files at their dot-path). Hand-rolling a flat
    // FormData here made uploads the only write that spoke a different wire
    // format, which backends parsing the envelope reject.
    const formData = applyMultipartPolicy(body, "force") as FormData;

    // ofetch has no upload-progress hook, so uploads go through XHR.
    // Same-origin request: the session cookie is attached automatically, and
    // `uploadUrl()` keeps the target identical to the one `useCrud` would hit.
    return await new Promise<MediaItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl());
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

  /** Hand files to the uploader, which queues them when it opens. */
  function queueUploads(files: File[]): void {
    queuedUploads.value = [...queuedUploads.value, ...files];
  }

  /** The files handed to the uploader, emptying the hand-over. */
  function takeQueuedUploads(): File[] {
    const files = queuedUploads.value;
    queuedUploads.value = [];
    return files;
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
    folderChildren.value = {};
    page.value = 1;
    pages.value = 1;
    mimeType.value = null;
    lockedMime.value = null;
    loading.value = false;
    editMedia.value = null;
    selection.value = null;
    editList.value = [];
    selectMode.value = "none";
    queuedUploads.value = [];
    _currentFolderId.value = null;
    _currentSearch.value = "";
    _currentAll.value = false;
    // Both come from the manager's props: the next manager sets its own.
    _currentLang.value = undefined;
    languageOverride.value = [];
  }

  return {
    // state
    medias,
    folders,
    parentFolders,
    folderChildren,
    page,
    pages,
    mimeType,
    lockedMime,
    loading,
    editMedia,
    selection,
    editList,
    selectMode,
    queuedUploads,
    languages,
    // getters
    activeLanguages,
    initialLanguage,
    parentFolder,
    editListSet,
    editListState,
    // actions
    getRoot,
    deriveLanguages,
    navigateToFolder,
    loadFolderChildren,
    openEditor,
    closeEditor,
    setLang,
    setLanguages,
    updateMedia,
    replaceFile,
    moveMedia,
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
    queueUploads,
    takeQueuedUploads,
    setMimeType,
    lockMimeType,
    reset,
  };
});

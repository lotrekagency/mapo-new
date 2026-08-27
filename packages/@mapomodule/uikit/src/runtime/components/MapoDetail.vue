<script setup lang="ts" generic="T extends object">
import {
  ref,
  computed,
  toRaw,
  watch,
  useSlots,
  onMounted,
  onBeforeUnmount,
  provide,
  type Ref,
  type VNode,
} from "vue";
import { useRouter, onBeforeRouteLeave, useNuxtApp } from "#app";
import { useI18n } from "vue-i18n";
import { objectDiff, debounce, deepClone } from "@mapomodule/utils";
import { useCrud } from "@mapomodule/core/runtime/api/crud";
import {
  getErrorData,
  getErrorDetail,
  getErrorStatus,
} from "@mapomodule/core/runtime/utils/fetchError";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import type { AnyFieldDescriptor, FieldRegistry } from "@mapomodule/form/types";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import type { MultipartPolicy } from "@mapomodule/core";

// ─── Props ────────────────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    /** REST endpoint passed to useCrud. */
    endpoint: string;
    /** Record id. Pass `'new'` to create. */
    id: string | number;
    /** Fields for the main body form. */
    fields: AnyFieldDescriptor<T>[];
    /** Fields for the sidebar form (optional). */
    sidebarFields?: AnyFieldDescriptor<T>[];
    /** Translation language codes (e.g. ['it', 'en']). */
    languages?: string[];
    /** Human readable model name shown in the page title. */
    modelName?: string | null;
    /** Sidebar column span (1–11 in a 12-col grid). */
    sidebarCols?: number;
    /** Keep sidebar sticky while scrolling. */
    sticky?: boolean;
    /** Send PATCH (diff only) on update instead of PUT. */
    usePatch?: boolean;
    /** Force read-only mode. */
    readonly?: boolean;
    /** Field registry. Falls back to $mapoFormRegistry if omitted. */
    registry?: FieldRegistry | null;
    /**
     * Enable automatic draft persistence to localStorage.
     * When `true`, the key is auto-generated as `${endpoint}:${id}`.
     * Provide `draftKey` to override with a custom key.
     * Drafts expire after 24 h. The built-in banner handles restore/discard.
     */
    draft?: boolean;
    /**
     * Custom localStorage key for draft persistence. Requires `draft: true`.
     * Key is prefixed with `mapo:draft:`.
     * Example: `"article:42"` → `mapo:draft:article:42`.
     * Falls back to `${endpoint}:${id}` when omitted.
     */
    draftKey?: string;
    /**
     * Multipart upload policy passed to every CRUD mutation.
     * - `"auto"` (default): sends FormData only when File/Blob fields are present.
     * - `"force"`: always sends FormData.
     * - `"disable"`: always sends JSON.
     */
    multipart?: MultipartPolicy;
    /**
     * Django model name for permission gating (e.g. `"article"`).
     * When provided, Save/Create is hidden for users lacking `add`/`change`,
     * and Delete is hidden for users lacking `delete`.
     * Superusers are never restricted.
     */
    permissionModel?: string;
    /**
     * Field name on the model whose value is used as the preview URL.
     * When set, a "Preview" button appears in the sidebar that opens the URL in an iframe modal.
     */
    previewField?: string;
    /**
     * Override the language list regardless of what `lang_info.site_languages`
     * returns from the backend. Takes precedence over both `languages` prop and
     * the auto-derived list.
     */
    forceLanguages?: string[];
  }>(),
  {
    sidebarFields: () => [],
    languages: () => [],
    sidebarCols: 4,
    sticky: true,
    usePatch: true,
    readonly: false,
    modelName: null,
    registry: null,
    draft: false,
    draftKey: undefined,
    multipart: "auto",
    permissionModel: undefined,
    previewField: undefined,
    forceLanguages: undefined,
  },
);

const emit = defineEmits<{
  (e: "saved", model: T): void;
  (e: "deleted"): void;
  /**
   * Fired after fetching when a valid, non-expired draft is found in localStorage.
   * Call `restore()` to apply the draft to the model, or `discard()` to delete it.
   */
  (
    e: "draft-found",
    draft: T,
    savedAt: Date,
    restore: () => void,
    discard: () => void,
  ): void;
}>();

// ─── State ───────────────────────────────────────────────────────────────────

const { $mapoFormRegistry } = useNuxtApp() as unknown as {
  $mapoFormRegistry: FieldRegistry;
};
const registry = computed(() => props.registry ?? $mapoFormRegistry);

const { t } = useI18n();
const router = useRouter();
const snack = useSnackStore();
const confirm = useConfirmStore();
const crud = useCrud<T>(props.endpoint);

type ValidateClientFn = () => {
  valid: boolean;
  errors: Record<string, string>;
};
const formValidators: ValidateClientFn[] = [];

provide("mapoDetailRegisterValidator", (fn: ValidateClientFn) => {
  formValidators.push(fn);
  return () => {
    const idx = formValidators.indexOf(fn);
    if (idx >= 0) formValidators.splice(idx, 1);
  };
});

const isNew = computed(() => String(props.id) === "new");
// Cast keeps the generic exact: `ref<T>` would expose `UnwrapRef<T>`, which
// TS cannot prove to extend `object` when forwarding to MapoForm.
const model = ref({} as T) as Ref<T>;

// T is only constrained to `object`; the record id is read structurally.
function recordId(): string | number {
  return (model.value as { id?: string | number }).id as string | number;
}
const backup = ref<T | null>(null);
const errors = ref<Record<string, string[]>>({});
// Start in loading state for existing items so MapoForm is never mounted with
// empty data and then immediately unmounted when the spinner appears on mount.
const isLoading = ref(String(props.id) !== "new");
const isSaving = ref(false);
const isDeleting = ref(false);
const currentLang = ref(props.languages[0] ?? "");
const draftBanner = ref<{
  savedAt: Date;
  restore: () => void;
  discard: () => void;
} | null>(null);

const isDirty = computed(
  () =>
    backup.value !== null &&
    Object.keys(objectDiff(backup.value, model.value)).length > 0,
);
const mainCols = computed(() => 12 - props.sidebarCols);

// ─── Languages (auto-derive from lang_info) ──────────────────────────────────
// Backends like Camomilla embed site_languages inside the fetched model.
// We read them after the first successful fetch so the host page doesn't need
// to hard-code the language list. forceLanguages > props.languages > derived.
const derivedLangs = ref<string[]>([]);
const activeLangs = computed<string[]>(() => {
  if (props.forceLanguages?.length) return props.forceLanguages;
  if (props.languages.length) return props.languages;
  return derivedLangs.value;
});
watch(
  activeLangs,
  (langs) => {
    if (!currentLang.value && langs.length) currentLang.value = langs[0]!;
  },
  { immediate: true },
);

// ─── Permissions ─────────────────────────────────────────────────────────────
// When permissionModel is set, save/create buttons are hidden for users who
// lack the add (new) or change (existing) permission, and the delete button is
// hidden for users who lack the delete permission.
const { canAdd, canChange, canDelete: canDeletePerm } = usePermissions();
const effectiveReadonly = computed(() => {
  if (props.readonly) return true;
  if (!props.permissionModel) return false;
  return isNew.value
    ? !canAdd(props.permissionModel)
    : !canChange(props.permissionModel);
});
const canDeleteItem = computed(
  () => !props.permissionModel || canDeletePerm(props.permissionModel),
);

// ─── Preview ─────────────────────────────────────────────────────────────────
// When previewField is set, the value of that field on the model is used as the
// URL opened in an iframe modal via the Preview button in the sidebar.
const previewOpen = ref(false);
const previewUrl = computed<string | null>(() => {
  if (!props.previewField) return null;
  const url = (model.value as Record<string, unknown>)[props.previewField];
  return typeof url === "string" ? url : null;
});

// When all sidebarFields are flat (no group), we wrap them in a UCard for visual structure.
// When groups are present, MapoFormGroup already renders its own card-like container.
const sidebarHasGroups = computed(() =>
  (props.sidebarFields ?? []).some((f) => f.group != null),
);
const sidebarStyle = computed(() =>
  props.sticky
    ? {
        position: "sticky" as const,
        top: "var(--mapo-topbar-height, 64px)",
      }
    : {},
);

// Tailwind v4 requires static class strings — dynamic template literals are not scanned by the CSS scanner.
const MD_COL_SPAN: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};
const mainColsClass = computed(
  () => `col-span-12 ${MD_COL_SPAN[mainCols.value] ?? "md:col-span-8"}`,
);
const sidebarColsClass = computed(
  () => `col-span-12 ${MD_COL_SPAN[props.sidebarCols] ?? "md:col-span-4"}`,
);

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFT_TTL = 86_400_000; // 24h

function draftStorageKey() {
  if (!props.draft && !props.draftKey) return null;
  const key = props.draftKey ?? `${props.endpoint}:${props.id}`;
  return `mapo:draft:${key}`;
}

function clearDraft() {
  const key = draftStorageKey();
  if (key && typeof localStorage !== "undefined") localStorage.removeItem(key);
}

function checkDraft() {
  const key = draftStorageKey();
  if (!key || typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const entry = JSON.parse(raw) as { model: T; savedAt: number };
    if (Date.now() - entry.savedAt > DRAFT_TTL) {
      localStorage.removeItem(key);
      return;
    }
    const savedAt = new Date(entry.savedAt);
    const restore = () => {
      Object.assign(model.value, entry.model);
      draftBanner.value = null;
    };
    const discard = () => {
      localStorage.removeItem(key);
      draftBanner.value = null;
    };
    draftBanner.value = { savedAt, restore, discard };
    emit("draft-found", entry.model, savedAt, restore, discard);
  } catch {
    /* corrupted entry — ignore */
  }
}

// Auto-save draft debounced whenever model changes and form is dirty.
if (props.draft || props.draftKey) {
  const saveDraft = debounce(() => {
    const key = draftStorageKey();
    if (!key || !isDirty.value || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ model: toRaw(model.value), savedAt: Date.now() }),
      );
    } catch {
      /* quota exceeded — ignore */
    }
  }, 2000);
  watch(model, saveDraft, { deep: true });
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchModel() {
  if (isNew.value) {
    backup.value = null;
    checkDraft();
    return;
  }
  isLoading.value = true;
  try {
    model.value = await crud.detail(props.id);
    backup.value = deepClone(model.value) as T;
    // Auto-derive languages from the backend response when the host page does
    // not hard-code them. Camomilla embeds site_languages inside lang_info.
    const langInfo = (model.value as Record<string, unknown>)?.lang_info as
      | Record<string, unknown>
      | undefined;
    const siteLangs = langInfo?.site_languages as string[] | undefined;
    if (
      siteLangs?.length &&
      !props.languages.length &&
      !props.forceLanguages?.length
    ) {
      derivedLangs.value = siteLangs;
    }
    checkDraft();
  } catch (err: unknown) {
    snack.show(getErrorDetail(err) ?? t("mapo.loadItemError"), "error");
    if (getErrorStatus(err) === 404) router.back();
  } finally {
    isLoading.value = false;
  }
}

// ─── Save ────────────────────────────────────────────────────────────────────

async function save(andBack = false) {
  const validationResults = formValidators.map((fn) => fn());
  const allValid = validationResults.every((r) => r.valid);
  if (!allValid) {
    const fieldErrors = validationResults.flatMap((r) =>
      Object.entries(r.errors),
    );
    const message = fieldErrors.length
      ? fieldErrors.map(([field, msg]) => `${field}: ${msg}`).join("\n")
      : t("mapo.fixErrors");
    snack.show(message, "error");
    return;
  }

  errors.value = {};
  isSaving.value = true;
  try {
    const multipartOpts = { multipart: props.multipart };
    let result: T;
    if (isNew.value) {
      result = await crud.create(model.value, undefined, multipartOpts);
    } else if (props.usePatch) {
      const patch = getPatch();
      result = await crud.partialUpdate(
        recordId(),
        patch,
        undefined,
        multipartOpts,
      );
    } else {
      result = await crud.update(
        recordId(),
        model.value,
        undefined,
        multipartOpts,
      );
    }
    Object.assign(model.value, result);
    backup.value = deepClone(model.value) as T;
    clearDraft();
    snack.show(
      isNew.value ? t("mapo.createSuccess") : t("mapo.saveSuccess"),
      "success",
    );
    emit("saved", model.value);
    if (isNew.value && result && "id" in result) {
      const id = (result as unknown as { id: string | number }).id;
      await router.replace({
        params: { id },
      });
    }
    if (andBack) back();
  } catch (err: unknown) {
    const data = getErrorData(err);
    if (getErrorStatus(err) === 400 && data && typeof data === "object") {
      errors.value = data as Record<string, string[]>;
      // Field-level errors: the useMapoForm watcher shows the detailed toast.
      // Only surface a toast here if the response carries a top-level detail message.
      const detail = (data as { detail?: string }).detail;
      if (detail) snack.show(detail, "error");
    } else {
      const detail = (data as { detail?: string } | undefined)?.detail;
      snack.show(detail ?? t("mapo.saveError"), "error");
    }
  } finally {
    isSaving.value = false;
  }
}

function getPatch(): Partial<T> {
  if (!backup.value) return { ...model.value };
  return objectDiff(backup.value, model.value) as Partial<T>;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function deleteItem() {
  const ok = await confirm.ask({
    title: t("mapo.delete"),
    message: t("mapo.detail.deleteQuestion"),
    confirmText: t("mapo.delete"),
    dangerous: true,
  });
  if (!ok) return;
  isDeleting.value = true;
  try {
    await crud.delete(recordId());
    backup.value = deepClone(model.value) as T; // clear dirty so guard doesn't fire
    snack.show(t("mapo.deleteSuccess"), "success");
    emit("deleted");
    back();
  } catch (err: unknown) {
    snack.show(getErrorDetail(err) ?? t("mapo.deleteError"), "error");
  } finally {
    isDeleting.value = false;
  }
}

// ─── Navigation guard ────────────────────────────────────────────────────────

function back() {
  router.back();
}

async function guardUnsaved(): Promise<boolean> {
  if (!isDirty.value) return true;
  return confirm.ask({
    title: t("mapo.unsavedData"),
    message: t("mapo.confirmLeaveChanges"),
    confirmText: t("mapo.leave"),
    dangerous: true,
  });
}

onBeforeRouteLeave(
  (_to: unknown, _from: unknown, next: (ok: boolean) => void) => {
    guardUnsaved().then((ok) => next(ok));
  },
);

function preventWindowClose(e: Event) {
  if (isDirty.value && typeof globalThis !== "undefined") {
    e.preventDefault();
    if ("returnValue" in e) {
      (e as BeforeUnloadEvent).returnValue = "";
    }
  }
}

onMounted(() => {
  if (typeof globalThis !== "undefined" && "addEventListener" in globalThis) {
    (globalThis as typeof globalThis & EventTarget).addEventListener(
      "beforeunload",
      preventWindowClose,
    );
  }
  fetchModel();
});

onBeforeUnmount(() => {
  if (
    typeof globalThis !== "undefined" &&
    "removeEventListener" in globalThis
  ) {
    (globalThis as typeof globalThis & EventTarget).removeEventListener(
      "beforeunload",
      preventWindowClose,
    );
  }
});

// ─── Slot bindings ───────────────────────────────────────────────────────────

// Forward field-level (`field.*`), group-level (`group.*`) and tab-level (`tab.*`,
// `tab-bar-end`) slots to MapoForm. Host-level slots (title, body, side-buttons, etc.)
// must not be injected into MapoForm to prevent duplicate or recursive rendering.
const slots = useSlots();
const formSlotNames = computed(() =>
  Object.keys(slots).filter(
    (name) =>
      name.startsWith("field.") ||
      name.startsWith("group.") ||
      name.startsWith("tab.") ||
      name === "tab-bar-end",
  ),
);

const slotBindings = computed(() => ({
  model: model.value,
  errors: errors.value,
  currentLang: currentLang.value,
  isNew: isNew.value,
  isLoading: isLoading.value,
  isSaving: isSaving.value,
  isDeleting: isDeleting.value,
  isDirty: isDirty.value,
  draftBanner: draftBanner.value,
  readonly: effectiveReadonly.value,
  canDelete: canDeleteItem.value,
  save,
  deleteItem,
  back,
}));

type DraftBannerState = {
  savedAt: Date;
  restore: () => void;
  discard: () => void;
} | null;

type SlotBindings = {
  model: T;
  errors: Record<string, string[]>;
  currentLang: string;
  isNew: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isDirty: boolean;
  draftBanner: DraftBannerState;
  readonly: boolean;
  canDelete: boolean;
  save: (andBack?: boolean) => Promise<void>;
  deleteItem: () => Promise<void>;
  back: () => void;
};

defineSlots<{
  /** Page title area. Receives full slot bindings. */
  title(props: SlotBindings): VNode[];
  /** Replaces the language switcher in the main column. */
  "body-lang"(props: SlotBindings): VNode[];
  /**
   * Draft restore banner shown when a localStorage draft is found.
   * Receives `draftBanner` (with `savedAt`, `restore`, `discard`) plus the full slot bindings.
   * Override to render a completely custom banner; set to an empty slot to suppress it.
   */
  "draft-banner"(props: SlotBindings): VNode[];
  /** Extra content above the main form. */
  "body-top"(props: SlotBindings): VNode[];
  /** Replaces the entire main form. */
  body(props: SlotBindings): VNode[];
  /** Extra content below the main form. */
  "body-bottom"(props: SlotBindings): VNode[];
  /** Replaces the entire sidebar action card (save/delete/back buttons). */
  "side-buttons"(props: SlotBindings): VNode[];
  /** Override just the Save button. */
  "button-save"(props: SlotBindings): VNode[];
  /** Override just the Save & continue button. */
  "button-savecontinue"(props: SlotBindings): VNode[];
  /** Override just the Back button. */
  "button-back"(props: SlotBindings): VNode[];
  /** Override just the Delete button. */
  "button-delete"(props: SlotBindings): VNode[];
  /** Extra content at the top of the sidebar (below action buttons). */
  "side-top"(props: SlotBindings): VNode[];
  /** Extra content at the bottom of the sidebar, above the danger zone. */
  "side-bottom"(props: SlotBindings): VNode[];
  /**
   * Danger-zone card at the very bottom of the sidebar (delete action).
   * Rendered only for existing records (`!isNew`). Override to replace or suppress it.
   */
  "side-danger"(props: SlotBindings): VNode[];
  /** Per-field slot. Slot name: `field.{key}`, `field.{key}.before`, `field.{key}.after`. */
  [K: `field.${string}`]: (props: {
    field: AnyFieldDescriptor<T>;
    model: T;
    currentLang: string;
  }) => VNode[];
  /** Per-group slot. Slot name: `group.{name}.before`, `group.{name}.after`. */
  [K: `group.${string}`]: (props: Record<string, never>) => VNode[];
  /** Catch-all for slots forwarded dynamically to the inner MapoForm. */
  [K: string]: (...args: any[]) => any;
}>();
</script>

<template>
  <!-- Loading state -->
  <div v-if="isLoading" class="flex items-center justify-center py-24">
    <UIcon
      name="i-lucide-loader-2"
      class="w-8 h-8 animate-spin text-gray-400"
    />
  </div>

  <div v-else>
    <!-- Draft banner -->
    <slot name="draft-banner" v-bind="slotBindings">
      <Transition name="slide-down">
        <UAlert
          v-if="draftBanner"
          icon="i-lucide-history"
          color="warning"
          variant="subtle"
          class="mb-3"
          :title="
            t('mapo.detail.draftSavedAt', {
              date: draftBanner.savedAt.toLocaleString(),
            })
          "
          :description="t('mapo.detail.draftFound')"
        >
          <template #actions>
            <UButton size="xs" color="warning" @click="draftBanner?.restore()">
              {{ t("mapo.restore") }}
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              @click="draftBanner?.discard()"
            >
              {{ t("mapo.discard") }}
            </UButton>
          </template>
        </UAlert>
      </Transition>
    </slot>

    <!-- Title -->
    <slot name="title" v-bind="slotBindings">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        {{ isNew ? t("mapo.new") : t("mapo.edit") }}
        <span v-if="modelName"> {{ modelName }}</span>
      </h1>
    </slot>

    <div class="grid grid-cols-12 gap-6 items-start">
      <!-- Main column -->
      <div :class="[mainColsClass, 'space-y-4']">
        <!-- Lang switch -->
        <slot name="body-lang" v-bind="slotBindings">
          <MapoDetailLangSwitch
            v-if="activeLangs.length > 1"
            v-model="currentLang"
            :langs="activeLangs"
            :errors="errors"
          />
        </slot>

        <slot name="body-top" v-bind="slotBindings" />

        <!-- Main form -->
        <slot name="body" v-bind="slotBindings">
          <MapoForm
            v-model="model"
            :fields="fields"
            :errors="errors"
            :languages="activeLangs"
            :current-lang="currentLang"
            :registry="registry"
            :readonly="effectiveReadonly"
          >
            <template
              v-for="slotName in formSlotNames"
              :key="slotName"
              #[slotName]="slotProps"
            >
              <slot :name="slotName" v-bind="slotProps ?? {}" />
            </template>
          </MapoForm>
        </slot>

        <slot name="body-bottom" v-bind="slotBindings" />
      </div>

      <!-- Sidebar column -->
      <div :class="sidebarColsClass">
        <div :style="sidebarStyle" class="space-y-4">
          <!-- Action buttons (Save / Save&continue / Back — no delete here) -->
          <slot name="side-buttons" v-bind="slotBindings">
            <UCard>
              <div class="flex flex-col gap-2">
                <slot name="button-save" v-bind="slotBindings">
                  <UButton
                    v-if="!effectiveReadonly"
                    block
                    :loading="isSaving"
                    icon="i-lucide-save"
                    @click="save(true)"
                  >
                    {{ isNew ? t("mapo.create") : t("mapo.save") }}
                  </UButton>
                </slot>

                <slot name="button-savecontinue" v-bind="slotBindings">
                  <UButton
                    v-if="!effectiveReadonly"
                    block
                    variant="soft"
                    :loading="isSaving"
                    icon="i-lucide-save"
                    @click="save(false)"
                  >
                    {{
                      isNew ? t("mapo.createContinue") : t("mapo.saveContinue")
                    }}
                  </UButton>
                </slot>

                <slot name="button-back" v-bind="slotBindings">
                  <UButton
                    block
                    variant="ghost"
                    icon="i-lucide-arrow-left"
                    @click="back"
                  >
                    {{ t("mapo.back") }}
                  </UButton>
                </slot>
              </div>
            </UCard>
          </slot>

          <slot name="side-top" v-bind="slotBindings" />

          <!-- Sidebar fields form.
               Flat fields (no group) get a UCard wrapper for visual structure.
               Grouped fields render their own group cards, so no outer wrapper. -->
          <template v-if="sidebarFields && sidebarFields.length">
            <UCard v-if="!sidebarHasGroups">
              <MapoForm
                v-model="model"
                :fields="sidebarFields"
                :errors="errors"
                :languages="activeLangs"
                :current-lang="currentLang"
                :registry="registry"
                :readonly="effectiveReadonly"
              >
                <template
                  v-for="slotName in formSlotNames"
                  :key="slotName"
                  #[slotName]="slotProps"
                >
                  <slot :name="slotName" v-bind="slotProps ?? {}" />
                </template>
              </MapoForm>
            </UCard>
            <MapoForm
              v-else
              v-model="model"
              :fields="sidebarFields"
              :errors="errors"
              :languages="activeLangs"
              :current-lang="currentLang"
              :registry="registry"
              :readonly="effectiveReadonly"
            >
              <template
                v-for="slotName in formSlotNames"
                :key="slotName"
                #[slotName]="slotProps"
              >
                <slot :name="slotName" v-bind="slotProps ?? {}" />
              </template>
            </MapoForm>
          </template>

          <slot name="side-bottom" v-bind="slotBindings" />

          <!-- Preview button — shown when previewField resolves to a URL -->
          <UButton
            v-if="previewUrl"
            block
            variant="outline"
            color="neutral"
            icon="i-lucide-eye"
            @click="previewOpen = true"
          >
            {{ t("mapo.preview") }}
          </UButton>

          <!-- Danger zone: delete action, visually separated from save actions -->
          <slot name="side-danger" v-bind="slotBindings">
            <UCard v-if="!isNew && canDeleteItem">
              <slot name="button-delete" v-bind="slotBindings">
                <UButton
                  block
                  color="error"
                  variant="soft"
                  :loading="isDeleting"
                  icon="i-lucide-trash-2"
                  @click="deleteItem"
                >
                  {{ t("mapo.delete") }}
                </UButton>
              </slot>
            </UCard>
          </slot>
        </div>
      </div>
    </div>

    <!-- Preview iframe modal -->
    <UModal
      v-if="previewField"
      v-model:open="previewOpen"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #content>
        <div class="flex flex-col" style="height: 80vh">
          <div
            class="flex items-center justify-between px-4 py-2 border-b border-default"
          >
            <span class="text-sm font-medium truncate">{{ previewUrl }}</span>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              @click="previewOpen = false"
            />
          </div>
          <iframe
            :src="previewUrl ?? ''"
            class="flex-1 w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

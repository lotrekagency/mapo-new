import {
  ref,
  computed,
  toRaw,
  toValue,
  watch,
  type Ref,
  type MaybeRef,
  provide,
  inject,
} from "vue";
import {
  getNestedValue,
  setNestedValueMutating,
  objectDiff,
  debounce,
} from "@mapomodule/utils";
import type { AnyFieldDescriptor, FieldRegistry } from "../types/index.js";
import { resolveFieldAccessor } from "../types/index.js";
import { useCurrentLang } from "./useCurrentLang.js";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useAuthStore } from "@mapomodule/store/runtime/stores/auth";

/** Options accepted by `useMapoForm()`. */
export interface UseMapoFormOptions<T extends object> {
  model: Ref<T>;
  fields: MaybeRef<AnyFieldDescriptor<T>[]>;
  errors?: Ref<Record<string, string[]>>;
  languages?: string[];
  currentLang?: Ref<string>;
  immediate?: boolean;
  /** Global debounce in milliseconds. Override per field with `descriptor.debounce`. Default: `300`. */
  debounce?: number;
  /**
   * When `false`, suppresses the toast that lists server-side field errors.
   * Set this for sub-forms (e.g. each repeater item) so they don't duplicate the
   * root form's error toast. Default: `true`.
   */
  notifyErrors?: boolean;
  registry: FieldRegistry;
  /**
   * When set, enables automatic draft persistence to localStorage.
   * Key is prefixed with `mapo:draft:`. Drafts expire after 24 h.
   * Call the returned `checkDraft()` after the model is populated to offer restore.
   * Example: `"article:42"` → `mapo:draft:article:42`.
   */
  draftKey?: MaybeRef<string | undefined>;
}

/** State exposed when a pending draft is found in localStorage. */
export interface MapoDraftBanner {
  savedAt: Date;
  restore: () => void;
  discard: () => void;
}

/** Reactive context shared with child form fields via provide/inject. */
export interface MapoFormContext<T extends object> {
  model: Ref<T>;
  fields: MaybeRef<AnyFieldDescriptor<T>[]>;
  errors: Ref<Record<string, string[]>>;
  languages: string[];
  currentLang: Ref<string>;
  readonly: Ref<boolean>;
  immediate: boolean;
  debounce: number;
  registry: FieldRegistry;
  setFieldValue: (key: string, val: unknown) => void;
  getClientError: (key: string) => string | null;
  markTouched: (key: string) => void;
  isTouched: (key: string) => boolean;
  submitted: Ref<boolean>;
}

function safeClone<X>(v: X): X {
  // Unwrap reactive proxies before cloning: structuredClone fails on Vue proxies,
  // but still preserves Date/File/Blob/Map instances that JSON would lose.
  const raw = toRaw(v) as X;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(raw);
    } catch {
      /* fall back to JSON */
    }
  }
  return JSON.parse(JSON.stringify(raw));
}

/** Injection key for the current Mapo form context. */
export const FORM_KEY = Symbol("mapoForm");

/**
 * Provides the current form context to descendant field components.
 * Internal: `useMapoForm` calls it automatically; consumers use `injectMapoForm`.
 */
function provideMapoForm<T extends object>(ctx: MapoFormContext<T>) {
  provide(FORM_KEY, ctx);
}

/** Injects the nearest form context, if present. */
export function injectMapoForm<T extends object>() {
  return inject<MapoFormContext<T> | undefined>(FORM_KEY, undefined);
}

/**
 * Creates the core reactive state and helpers for a Mapo form.
 * Handles dirty tracking, field accessors, sync validation, and submit flows.
 */
export function useMapoForm<T extends object>(options: UseMapoFormOptions<T>) {
  const {
    model,
    fields,
    errors = ref({}),
    languages = [],
    currentLang: currentLangProp,
    immediate = false,
    debounce: debounceMs = 300,
    notifyErrors = true,
    registry,
  } = options;

  const currentLang = useCurrentLang(currentLangProp);
  const snack = useSnackStore();
  const authStore = useAuthStore();
  const backup = ref(safeClone(model.value)) as Ref<T>;
  const clientErrors = ref<Record<string, string>>({});
  const isLoading = ref(false);
  const readonly = ref(false);
  const touched = ref<Set<string>>(new Set());
  const submitted = ref(false);

  // Show a toast listing field-level BE errors whenever the server populates `errors`.
  // Skipped for sub-forms (notifyErrors=false) so repeater items don't duplicate it.
  if (notifyErrors) {
    watch(
      errors,
      (val) => {
        const entries = Object.entries(val);
        if (!entries.length) return;
        const lines = entries
          .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
          .join("\n");
        snack.show(lines, "error");
      },
      { deep: true },
    );
  }

  // Incremental dirty tracking: updated in setFieldValue to avoid
  // a JSON.stringify(objectDiff(...)) on every computed read.
  const dirtyKeys = ref<Set<string>>(new Set());
  const isDirty = computed(() => dirtyKeys.value.size > 0);

  // ─── Draft persistence ──────────────────────────────────────────────────────

  const DRAFT_TTL = 86_400_000; // 24 h
  const draftBanner = ref<MapoDraftBanner | null>(null);

  function _draftStorageKey(): string | null {
    const key = toValue(options.draftKey);
    if (!key) return null;
    const userId = authStore.info?.id ?? "anonymous";
    return `mapo:draft:${userId}:${key}`;
  }

  function clearDraft() {
    const key = _draftStorageKey();
    if (key && typeof localStorage !== "undefined")
      localStorage.removeItem(key);
  }

  /**
   * Reads localStorage for a pending draft and, if found, populates `draftBanner`
   * with `restore` / `discard` callbacks. Call this after the model has been
   * fetched from the server so the user can choose whether to apply the draft.
   */
  function checkDraft() {
    const key = _draftStorageKey();
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
      draftBanner.value = {
        savedAt,
        restore: () => {
          Object.assign(model.value, entry.model);
          draftBanner.value = null;
        },
        discard: () => {
          localStorage.removeItem(key);
          draftBanner.value = null;
        },
      };
    } catch {
      /* corrupted entry — ignore */
    }
  }

  if (options.draftKey) {
    const saveDraft = debounce(() => {
      const key = _draftStorageKey();
      if (!key || !isDirty.value || typeof localStorage === "undefined") return;
      try {
        const noDraftKeys = new Set(
          toValue(fields)
            .filter((f) => f.noDraft)
            .map((f) => f.key as string),
        );
        const snapshot = toRaw(model.value) as Record<string, unknown>;
        const filtered =
          noDraftKeys.size > 0
            ? Object.fromEntries(
                Object.entries(snapshot).filter(([k]) => !noDraftKeys.has(k)),
              )
            : snapshot;
        localStorage.setItem(
          key,
          JSON.stringify({ model: filtered, savedAt: Date.now() }),
        );
      } catch {
        /* quota exceeded — ignore */
      }
    }, 2000);
    watch(model, saveDraft, { deep: true });
  }

  function markTouched(key: string) {
    if (touched.value.has(key)) return;
    touched.value.add(key);
    touched.value = new Set(touched.value);
  }

  function isTouched(key: string): boolean {
    return submitted.value || touched.value.has(key);
  }

  const allErrors = computed(() => {
    const merged: Record<string, string[]> = { ...errors.value };
    for (const [k, v] of Object.entries(clientErrors.value)) {
      merged[k] = [v, ...(merged[k] ?? [])];
    }
    return merged;
  });

  function resolvePath(descriptor: AnyFieldDescriptor<T>): string {
    const lang = currentLang.value;
    if (descriptor.translatable && lang) {
      return `translations.${lang}.${descriptor.key}`;
    }
    return descriptor.key as string;
  }

  function initLang(lang: string) {
    const m = model.value as Record<string, unknown>;
    if (!m.translations) m.translations = {};
    const translations = m.translations as Record<string, unknown>;
    if (!translations[lang]) translations[lang] = {};
  }

  function setFieldValue(descriptor: AnyFieldDescriptor<T>, val: unknown) {
    const accessor = resolveFieldAccessor(descriptor, registry);
    const setVal = accessor.set
      ? accessor.set({ model: model.value, val, lang: currentLang.value })
      : val;

    if (descriptor.synci18n && languages.length) {
      for (const lang of languages) {
        initLang(lang);
        setNestedValueMutating(
          model.value as unknown as Record<string, unknown>,
          `translations.${lang}.${descriptor.key as string}`,
          setVal,
        );
      }
    } else {
      if (descriptor.translatable && currentLang.value)
        initLang(currentLang.value);
      setNestedValueMutating(
        model.value as unknown as Record<string, unknown>,
        resolvePath(descriptor),
        setVal,
      );
    }

    descriptor.onChange?.({ model: model.value, val: setVal });

    const key = descriptor.key as string;
    if (!dirtyKeys.value.has(key)) {
      dirtyKeys.value.add(key);
      dirtyKeys.value = new Set(dirtyKeys.value);
    }
    // Clear any stale client-side errors for this field: while the user is typing
    // it makes no sense to leave an old message until the next validation run.
    if (clientErrors.value[key]) {
      const next = { ...clientErrors.value };
      delete next[key];
      clientErrors.value = next;
    }
  }

  function getFieldValue(descriptor: AnyFieldDescriptor<T>): unknown {
    const raw = getNestedValue(model.value, resolvePath(descriptor));
    const accessor = resolveFieldAccessor(descriptor, registry);
    return accessor.get
      ? accessor.get({ model: model.value, val: raw, lang: currentLang.value })
      : raw;
  }

  function checkRequired(
    descriptor: AnyFieldDescriptor<T>,
    val: unknown,
  ): string | null {
    if (!descriptor.required) return null;
    if (val === null || val === undefined || val === "")
      return "This field is required.";
    return null;
  }

  function getClientError(descriptor: AnyFieldDescriptor<T>): string | null {
    if (!descriptor.required && !descriptor.validate) return null;
    // "No-anxiety" gate: the error appears only after blur or submit, never on mount.
    // Bypassed when immediate=true so errors show from the very first render.
    if (!immediate && !isTouched(descriptor.key as string)) return null;
    const val = getFieldValue(descriptor);
    return (
      checkRequired(descriptor, val) ??
      descriptor.validate?.(val as T[keyof T & string] | null | undefined, {
        model: model.value,
      }) ??
      null
    );
  }

  function validateClient(): {
    valid: boolean;
    errors: Record<string, string>;
  } {
    // Mark as submitted so getClientError() shows errors for all fields,
    // not just touched ones. Called both from submit() and from external
    // consumers (e.g. MapoDetail) that bypass the submit() handler.
    submitted.value = true;
    const errs: Record<string, string> = {};
    const fs = toValue(fields);
    for (const descriptor of fs) {
      if (!descriptor.required && !descriptor.validate) continue;
      const val = getFieldValue(descriptor);
      const err =
        checkRequired(descriptor, val) ??
        descriptor.validate?.(val as T[keyof T & string] | null | undefined, {
          model: model.value,
        }) ??
        null;
      if (err) errs[descriptor.key as string] = err;
    }
    clientErrors.value = errs;
    return { valid: Object.keys(errs).length === 0, errors: errs };
  }

  function resetDirty() {
    backup.value = safeClone(model.value);
    dirtyKeys.value = new Set();
  }

  function getPatch(): Partial<T> {
    return objectDiff(backup.value, model.value) as Partial<T>;
  }

  async function submit(
    handler: (model: T | Partial<T>, isNew: boolean) => Promise<void>,
    isNew = false,
  ) {
    if (isLoading.value) return;
    submitted.value = true;
    const { valid } = validateClient();
    if (!valid) {
      snack.show("Please fix the errors before saving.", "error");
      return;
    }
    isLoading.value = true;
    try {
      await handler(isNew ? model.value : getPatch(), isNew);
      resetDirty();
      clearDraft();
      submitted.value = false;
      touched.value = new Set();
    } finally {
      isLoading.value = false;
    }
  }

  // O(1) key→descriptor lookup. Rebuilt only when the field list itself changes,
  // not on every model edit — this keeps per-field error/value resolution O(1)
  // instead of O(fields), avoiding O(fields²) work across a large form on each keystroke.
  const fieldIndex = computed(() => {
    const map = new Map<string, AnyFieldDescriptor<T>>();
    for (const f of toValue(fields)) map.set(f.key as string, f);
    return map;
  });
  const findDescriptor = (key: string) => fieldIndex.value.get(key);

  const ctx: MapoFormContext<T> = {
    model,
    fields,
    errors: allErrors,
    languages,
    currentLang,
    readonly,
    immediate,
    debounce: debounceMs,
    registry,
    setFieldValue: (key: string, val: unknown) => {
      const descriptor = findDescriptor(key);
      if (descriptor) setFieldValue(descriptor, val);
    },
    getClientError: (key: string) => {
      const descriptor = findDescriptor(key);
      return descriptor ? getClientError(descriptor) : null;
    },
    markTouched,
    isTouched,
    submitted,
  };

  // Public API: accepts either a string key or a full descriptor, making it ergonomic
  // for external consumers (tests, user code) as well as internal callers.
  function setFieldValuePublic(
    keyOrDescriptor: string | AnyFieldDescriptor<T>,
    val: unknown,
  ) {
    if (typeof keyOrDescriptor === "string") {
      const descriptor = findDescriptor(keyOrDescriptor);
      if (descriptor) setFieldValue(descriptor, val);
      return;
    }
    setFieldValue(keyOrDescriptor, val);
  }

  function getClientErrorPublic(
    keyOrDescriptor: string | AnyFieldDescriptor<T>,
  ): string | null {
    if (typeof keyOrDescriptor === "string") {
      const descriptor = findDescriptor(keyOrDescriptor);
      return descriptor ? getClientError(descriptor) : null;
    }
    return getClientError(keyOrDescriptor);
  }

  // Automatically provide the context so descendant MapoForm / MapoFormField
  // components inherit submitted/readonly state with no explicit wiring.
  provideMapoForm(ctx);

  return {
    state: computed(() => ({
      model: model.value,
      errors: allErrors.value,
      isDirty: isDirty.value,
      currentLang: currentLang.value,
      isLoading: isLoading.value,
    })),
    isDirty,
    isLoading,
    readonly,
    currentLang,
    getFieldValue,
    setFieldValue: setFieldValuePublic,
    getClientError: getClientErrorPublic,
    markTouched,
    isTouched,
    validateClient,
    resetDirty,
    getPatch,
    submit,
    ctx,
    draftBanner,
    checkDraft,
    clearDraft,
  };
}

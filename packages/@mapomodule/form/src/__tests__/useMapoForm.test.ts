import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useMapoForm } from "../runtime/composables/useMapoForm.js";
import { defaultRegistry } from "../runtime/registry/defaults.js";
import type { FieldDescriptor } from "../runtime/types/descriptor.js";

vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => ({ info: { id: 1, username: "testuser" } }),
}));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
// Pulls in `nuxt/app`, which cannot resolve outside a Nuxt build. Assertions
// below match on message keys, so echoing the key back is the useful stub.
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

// provide/inject called outside setup() emits a warning; silence it in tests.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

interface Article {
  title: string;
  slug: string;
  is_draft: boolean;
  count: number;
  translations: Record<string, Partial<Article>>;
}

function makeForm(overrides: Partial<Article> = {}) {
  const model = ref<Article>({
    title: "",
    slug: "",
    is_draft: false,
    count: 0,
    translations: {},
    ...overrides,
  });

  const fields = ref<FieldDescriptor<Article>[]>([
    { key: "title", type: "text" as const },
    { key: "slug", type: "text" as const },
    { key: "is_draft", type: "switch" as const },
    { key: "count", type: "number" as const },
  ]);

  const form = useMapoForm({
    model,
    fields,
    registry: defaultRegistry,
    immediate: true,
  });

  return { model, form };
}

// ─── isDirty ─────────────────────────────────────────────────────────────────

describe("isDirty", () => {
  it("is false on init", () => {
    const { form } = makeForm();
    expect(form.isDirty.value).toBe(false);
  });

  it("is true after setFieldValue", () => {
    const { form } = makeForm();
    form.setFieldValue("title", "Hello");
    expect(form.isDirty.value).toBe(true);
  });

  it("resets to false after resetDirty", () => {
    const { form } = makeForm();
    form.setFieldValue("title", "Hello");
    form.resetDirty();
    expect(form.isDirty.value).toBe(false);
  });
});

// ─── setFieldValue / getFieldValue ───────────────────────────────────────────

describe("setFieldValue", () => {
  it("writes the value to model", () => {
    const { model, form } = makeForm();
    form.setFieldValue("title", "Mapo");
    expect(model.value.title).toBe("Mapo");
  });

  it("writes nested path (dotted key)", () => {
    const { model } = makeForm();
    // meta.slug is intentionally not a key of Article — tests runtime dotted-path writes on arbitrary paths
    const extendedFields = ref<FieldDescriptor<any>[]>([
      { key: "meta.slug", type: "text" as const },
    ]);
    const extForm = useMapoForm({
      model,
      fields: extendedFields,
      registry: defaultRegistry,
      immediate: true,
    });
    extForm.setFieldValue("meta.slug", "hello");
    expect((model.value as any).meta.slug).toBe("hello");
  });
});

describe("getFieldValue", () => {
  it("reads the current value", () => {
    const { form } = makeForm({ title: "Existing" });
    expect(form.getFieldValue({ key: "title", type: "text" })).toBe("Existing");
  });
});

// ─── getPatch ────────────────────────────────────────────────────────────────

describe("getPatch", () => {
  it("returns empty on no changes", () => {
    const { form } = makeForm();
    expect(form.getPatch()).toEqual({});
  });

  it("returns only changed fields", () => {
    const { form } = makeForm({ title: "Old", slug: "old-slug" });
    form.setFieldValue("title", "New");
    const patch = form.getPatch();
    expect(patch).toHaveProperty("title", "New");
    expect(patch).not.toHaveProperty("slug");
  });
});

// ─── validateClient ───────────────────────────────────────────────────────────

describe("validateClient", () => {
  it("returns valid=true when no validate callbacks", () => {
    const { form } = makeForm();
    const { valid } = form.validateClient();
    expect(valid).toBe(true);
  });

  it("returns valid=false when a validate callback returns error", () => {
    const model = ref<Article>({
      title: "",
      slug: "",
      is_draft: false,
      count: 0,
      translations: {},
    });
    const fields = ref<FieldDescriptor<Article>[]>([
      {
        key: "title",
        type: "text" as const,
        validate: (val: unknown) => (val ? null : "Required"),
      },
    ]);
    const form = useMapoForm({
      model,
      fields,
      registry: defaultRegistry,
      immediate: true,
    });
    const { valid, errors } = form.validateClient();
    expect(valid).toBe(false);
    expect(errors.title).toBe("Required");
  });

  it("returns valid=true when validate callback returns null", () => {
    const model = ref<Article>({
      title: "Hello",
      slug: "",
      is_draft: false,
      count: 0,
      translations: {},
    });
    const fields = ref<FieldDescriptor<Article>[]>([
      {
        key: "title",
        type: "text" as const,
        validate: (val: unknown) => (val ? null : "Required"),
      },
    ]);
    const form = useMapoForm({
      model,
      fields,
      registry: defaultRegistry,
      immediate: true,
    });
    expect(form.validateClient().valid).toBe(true);
  });
});

// ─── i18n: translatable + initLang ───────────────────────────────────────────

describe("translatable fields", () => {
  it("writes to translations.<lang>.<key>", () => {
    const model = ref<Article>({
      title: "",
      slug: "",
      is_draft: false,
      count: 0,
      translations: {},
    });
    const fields = ref<FieldDescriptor<Article>[]>([
      { key: "title", type: "text" as const, translatable: true },
    ]);
    const currentLang = ref("it");
    const form = useMapoForm({
      model,
      fields,
      registry: defaultRegistry,
      immediate: true,
      currentLang,
    });
    form.setFieldValue("title", "Ciao");
    expect(model.value.translations?.it?.title).toBe("Ciao");
  });

  it("auto-initializes translations[lang] = {} (initLang)", () => {
    const model = ref<Article>({
      title: "",
      slug: "",
      is_draft: false,
      count: 0,
      translations: {},
    });
    const fields = ref<FieldDescriptor<Article>[]>([
      { key: "title", type: "text" as const, translatable: true },
    ]);
    const currentLang = ref("de");
    const form = useMapoForm({
      model,
      fields,
      registry: defaultRegistry,
      immediate: true,
      currentLang,
    });
    form.setFieldValue("title", "Hallo");
    expect(model.value.translations).toHaveProperty("de");
  });

  it("propagates synci18n to all languages", () => {
    const model = ref<Article>({
      title: "",
      slug: "",
      is_draft: false,
      count: 0,
      translations: {},
    });
    const fields = ref<FieldDescriptor<Article>[]>([
      {
        key: "title",
        type: "text" as const,
        translatable: true,
        synci18n: true,
      },
    ]);
    const currentLang = ref("it");
    const form = useMapoForm({
      model,
      fields,
      registry: defaultRegistry,
      immediate: true,
      currentLang,
      languages: ["en", "it"],
    });
    form.setFieldValue("title", "Synced");
    expect(model.value.translations?.en?.title).toBe("Synced");
    expect(model.value.translations?.it?.title).toBe("Synced");
  });
});

// ─── submit ───────────────────────────────────────────────────────────────────

describe("submit", () => {
  it("calls handler and resets dirty on success", async () => {
    const { form } = makeForm();
    form.setFieldValue("title", "X");
    const handler = vi.fn().mockResolvedValue(undefined);
    await form.submit(handler);
    expect(handler).toHaveBeenCalled();
    expect(form.isDirty.value).toBe(false);
  });

  it("does not call handler when validateClient fails", async () => {
    const model = ref<Article>({
      title: "",
      slug: "",
      is_draft: false,
      count: 0,
      translations: {},
    });
    const fields = ref<FieldDescriptor<Article>[]>([
      {
        key: "title",
        type: "text" as const,
        validate: (v: unknown) => (v ? null : "err"),
      },
    ]);
    const form = useMapoForm({
      model,
      fields,
      registry: defaultRegistry,
      immediate: true,
    });
    const handler = vi.fn();
    await form.submit(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes full model when isNew=true, patch when isNew=false", async () => {
    const { form } = makeForm({ title: "Old" });
    form.setFieldValue("title", "New");
    const calls: unknown[] = [];
    await form.submit(async (data) => {
      calls.push(data);
    }, false);
    expect(calls[0]).toEqual({ title: "New" }); // diff only

    form.setFieldValue("slug", "new-slug");
    await form.submit(async (data) => {
      calls.push(data);
    }, true);
    expect(calls[1]).toHaveProperty("slug", "new-slug"); // full model
  });
});

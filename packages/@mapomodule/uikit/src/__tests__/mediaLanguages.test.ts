import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const optionsMock = vi.fn();

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({ public: {} }),
  useNuxtApp: () => ({ $mapoFetch: vi.fn() }),
}));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({
  useCrud: () => ({ options: optionsMock }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

const { useMediaStore } = await import("../runtime/stores/media");

describe("media store — languages from OPTIONS", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    optionsMock.mockReset();
  });

  it("reads the media model's own languages", async () => {
    optionsMock.mockResolvedValue({
      lang_info: { translatable: true, languages: ["it", "en"] },
    });
    const store = useMediaStore();
    await store.deriveLanguages();
    expect(store.languages).toEqual(["it", "en"]);
  });

  it("offers none when the model is not registered for translation", async () => {
    optionsMock.mockResolvedValue({
      lang_info: { translatable: false, languages: [] },
    });
    const store = useMediaStore();
    await store.deriveLanguages();
    expect(store.languages).toEqual([]);
  });

  // Manager, picker dialog and the `media` form field each mount an editor;
  // without the shared promise that is one OPTIONS request per editor.
  it("asks once however many editors mount", async () => {
    optionsMock.mockResolvedValue({ lang_info: { languages: ["it"] } });
    const store = useMediaStore();
    await Promise.all([
      store.deriveLanguages(),
      store.deriveLanguages(),
      store.deriveLanguages(),
    ]);
    expect(optionsMock).toHaveBeenCalledOnce();
  });

  it("retries after a failure instead of caching the empty result", async () => {
    optionsMock.mockRejectedValueOnce(new Error("offline"));
    const store = useMediaStore();
    await store.deriveLanguages();
    expect(store.languages).toEqual([]);

    optionsMock.mockResolvedValue({ lang_info: { languages: ["it"] } });
    await store.deriveLanguages();
    expect(store.languages).toEqual(["it"]);
  });
});

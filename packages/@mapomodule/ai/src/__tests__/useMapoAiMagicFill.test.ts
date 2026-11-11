import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";
import type { EffectScope } from "vue";
import type {
  AnyFieldDescriptor,
  FieldAnnotations,
} from "@mapomodule/form/types";
import {
  joinMagicFill,
  useMapoAiMagicFill,
} from "../runtime/composables/useMapoAiMagicFill";
import type { MapoAiMagicFillDetail } from "../runtime/composables/useMapoAiMagicFill";
import { useMapoAiStatus } from "../runtime/composables/useMapoAiStatus";

/** What the mocked `useNuxtApp()` returns: `$mapoFetch` and `$i18n` of the test. */
const nuxt = vi.hoisted(() => {
  const state: { app: Record<string, unknown> } = { app: {} };
  return state;
});

vi.mock("nuxt/app", () => ({ useNuxtApp: () => nuxt.app }));

/** A `t()` that writes the key and its values, so a test sees both. */
function t(key: string, params: Record<string, unknown> = {}): string {
  const values = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  return values.length
    ? `${key} ${JSON.stringify(Object.fromEntries(values))}`
    : key;
}

const STATUS = {
  contract: 2,
  allowed: true,
  admin: false,
  providers: [
    { id: "mock", label: "Mock", models: ["mock"] },
    { id: "ollama", label: "Ollama", models: ["qwen3.8:27b", "gemma4:12b"] },
  ],
  default: {
    provider: "ollama",
    models: { fill: "gemma4:12b", extract: "gemma4:12b" },
  },
  limits: {
    perUserPerMinute: 20,
    maxSourceChars: 100,
    maxInstructionsChars: 30,
    maxFileBytes: 1000,
  },
  readers: [
    { id: "text", label: "Text", extensions: ["txt"], types: ["text/plain"] },
  ],
};

function answered(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    task: "fill",
    status: "answered",
    result: { readable: true, fields, warnings: [] },
    provider: { id: "ollama", model: "gemma4:12b" },
    prompt: 1,
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

const VERIFIED_TITLE = {
  title: {
    status: "filled",
    value: "About us",
    verified: true,
    quotes: [{ quote: "About us", where: "", found: true }],
  },
};

/** A failure as `$fetch` rejects with it. */
function fetchError(status: number): Error {
  return Object.assign(new Error(`[POST]: ${status}`), {
    statusCode: status,
    response: new Response(null, { status }),
  });
}

type Route = (options: Record<string, unknown>) => unknown;

/** The gateway: `$mapoFetch` answering each path with its route, and every call it got. */
function gateway(routes: Record<string, Route>) {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  const fetch = vi.fn(
    async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      const route = routes[path];
      if (!route) throw new Error(`No route ${path}`);
      return route(options);
    },
  );
  nuxt.app = { $mapoFetch: fetch, $i18n: { t } };
  return calls;
}

/** A route that answers only when the test says, and rejects when the call is aborted. */
function held(): { route: Route; answer: (value: unknown) => void } {
  let answer: (value: unknown) => void = () => undefined;
  const route: Route = (options) =>
    new Promise((resolve, reject) => {
      answer = resolve;
      const signal = options.signal as AbortSignal | undefined;
      signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  return { route, answer: (value) => answer(value) };
}

const FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title" },
  { key: "seo.title", type: "text" },
];

/** A detail, shaped as `useMapoDetail()` gives it. */
function detail(extra: Partial<MapoAiMagicFillDetail> = {}) {
  return {
    model: ref<Record<string, unknown>>({}),
    fields: computed(() => FIELDS),
    sidebarFields: computed((): AnyFieldDescriptor[] => []),
    annotations: ref<FieldAnnotations>({}),
    metadata: vi.fn(
      async (): Promise<Record<string, unknown> | undefined> => undefined,
    ),
    isNew: computed(() => true),
    currentLang: ref(""),
    readonly: ref(false),
    isBusy: ref(false),
    modelName: computed(() => "Article"),
    permissionModel: computed(() => "article" as string | undefined),
    ...extra,
  } satisfies MapoAiMagicFillDetail;
}

const scopes: EffectScope[] = [];

/** The state of a detail, as a component inside it gets it. */
function mounted<T extends MapoAiMagicFillDetail>(form: T) {
  const scope = effectScope();
  scopes.push(scope);
  return { magic: scope.run(() => useMapoAiMagicFill(form))!, scope };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

beforeEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  nuxt.app = {};
});

describe("useMapoAiMagicFill — one state per detail", () => {
  it("gives every component of a detail the same state, alive while one of them is", async () => {
    gateway({});
    const form = detail();
    const first = mounted(form);
    const second = mounted(form);

    expect(second.magic).toBe(first.magic);
    first.scope.stop();
    await flush();
    expect(mounted(form).magic).toBe(first.magic);

    for (const scope of scopes) scope.stop();
    await flush();
    expect(mounted(form).magic).not.toBe(first.magic);
  });

  it("keeps the state, and its call, when its only component is replaced in one update", async () => {
    const run = held();
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": run.route,
    });
    const form = detail();
    const old = mounted(form);
    await useMapoAiStatus().refresh();
    old.magic.text.value = "Title: About us";
    void old.magic.extract();
    await flush();

    // A keyed swap: the old component goes and the new one comes, in one update.
    old.scope.stop();
    const replaced = mounted(form);
    await flush();

    expect(replaced.magic).toBe(old.magic);
    expect(replaced.magic.text.value).toBe("Title: About us");
    expect(replaced.magic.phase.value).toBe("waiting");
    const request = calls.find((call) => call.path === "/_mapo/ai/run");
    expect((request?.options.signal as AbortSignal).aborted).toBe(false);
  });

  it("stops reading the files and composing the preview when the last component of the detail goes", async () => {
    const read = held();
    const composing = held();
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/read": read.route,
      "/_mapo/ai/run/preview": composing.route,
    });
    const { magic, scope } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.attach([new File(["Hello"], "a.txt")]);
    void magic.loadPreview();
    await flush();

    scope.stop();
    await flush();

    for (const path of ["/_mapo/ai/read", "/_mapo/ai/run/preview"]) {
      const request = calls.find((call) => call.path === path);
      expect((request?.options.signal as AbortSignal).aborted).toBe(true);
    }
  });

  it("lets the first component render the panel, and passes it on when it goes", () => {
    gateway({});
    const { magic } = mounted(detail());
    const banner = joinMagicFill(magic, "banner");
    const action = joinMagicFill(magic, "action");

    expect(banner.isFirst.value).toBe(true);
    expect(action.isFirst.value).toBe(false);
    expect(banner.hasAction.value).toBe(true);

    banner.leave();
    expect(action.isFirst.value).toBe(true);
    action.leave();
    expect(banner.hasAction.value).toBe(false);
  });

  it("lets a part the app replaced say it is there, and leaves the panel to Magic Fill's own parts", () => {
    gateway({});
    const form = detail();
    const { magic } = mounted(form);
    const banner = joinMagicFill(magic, "banner");
    expect(banner.hasAction.value).toBe(false);

    // The app's own button, as an override of MapoAiMagicFillAction.
    const button = effectScope();
    scopes.push(button);
    button.run(() => useMapoAiMagicFill(form, { part: "action" }));

    expect(banner.hasAction.value).toBe(true);
    expect(banner.isFirst.value).toBe(true);
    button.stop();
    expect(banner.hasAction.value).toBe(false);
  });

  it("lets the first panel show, apart from the button and the banner", () => {
    gateway({});
    const { magic } = mounted(detail());
    const action = joinMagicFill(magic, "action");
    const panel = joinMagicFill(magic, "panel");
    const another = joinMagicFill(magic, "panel");

    expect(action.isFirst.value).toBe(true);
    expect(panel.isFirst.value).toBe(true);
    expect(another.isFirst.value).toBe(false);

    panel.leave();
    expect(another.isFirst.value).toBe(true);
    expect(action.isFirst.value).toBe(true);
  });
});

describe("useMapoAiMagicFill — what the user may do", () => {
  it("offers the models of status, from the default, once status answers", async () => {
    gateway({ "/_mapo/ai/status": () => STATUS });
    const { magic } = mounted(detail());

    expect(magic.available.value).toBe(false);
    await useMapoAiStatus().refresh();

    expect(magic.available.value).toBe(true);
    expect(magic.choices.value.map((one) => one.model)).toEqual([
      "mock",
      "qwen3.8:27b",
      "gemma4:12b",
    ]);
    expect(magic.choice.value).toMatchObject({
      provider: "ollama",
      model: "gemma4:12b",
    });
  });

  it("offers nothing to a user the app keeps out, nor on a record they cannot edit", async () => {
    gateway({
      "/_mapo/ai/status": () => ({ contract: 2, allowed: false, admin: false }),
    });
    const kept = mounted(detail()).magic;
    await useMapoAiStatus().refresh();
    expect(kept.available.value).toBe(false);

    gateway({ "/_mapo/ai/status": () => STATUS });
    const locked = mounted(detail({ readonly: ref(true) })).magic;
    await useMapoAiStatus().refresh();
    expect(locked.available.value).toBe(false);
  });

  it("says why Extract cannot run: no source, a file being read, no model, a record busy, the limits", async () => {
    gateway({
      "/_mapo/ai/status": () => ({ ...STATUS, providers: [] }),
      "/_mapo/ai/read": () => new Promise(() => undefined),
    });
    const busy = ref(false);
    const { magic } = mounted(detail({ isBusy: busy }));
    await useMapoAiStatus().refresh();
    const kinds = () => magic.problems.value.map((problem) => problem.kind);

    expect(kinds()).toEqual(["empty", "no-provider"]);
    magic.text.value = "x".repeat(101);
    magic.instructions.value = "i".repeat(31);
    busy.value = true;
    magic.attach([new File(["Hello"], "a.txt", { type: "text/plain" })]);

    expect(kinds()).toEqual([
      "too-long",
      "instructions-too-long",
      "reading",
      "no-provider",
      "busy",
    ]);
  });
});

describe("useMapoAiMagicFill — status, as it changes", () => {
  it("keeps the last status when asking again fails, so the panel stays", async () => {
    let fails = false;
    gateway({
      "/_mapo/ai/status": () => {
        if (fails) throw fetchError(503);
        return STATUS;
      },
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    expect(magic.available.value).toBe(true);

    fails = true;
    await useMapoAiStatus().refresh();

    expect(magic.available.value).toBe(true);
    expect(magic.choice.value?.model).toBe("gemma4:12b");
  });

  it("keeps a call under way in view, with its Cancel, when status takes the AI away", async () => {
    const run = held();
    let allowed = true;
    gateway({
      "/_mapo/ai/status": () => ({ ...STATUS, allowed }),
      "/_mapo/ai/run": run.route,
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";
    const done = magic.extract();
    await flush();

    allowed = false;
    await useMapoAiStatus().refresh();
    expect(magic.available.value).toBe(true);

    magic.cancel();
    await done;
    expect(magic.available.value).toBe(false);
  });
});

describe("useMapoAiMagicFill — Extract", () => {
  it("reads the record's description, asks the model chosen, applies the answer and closes the panel", async () => {
    const run = held();
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": run.route,
    });
    const form = detail();
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.open.value = true;
    magic.text.value = "Title: About us";
    magic.instructions.value = "Only the title.";

    const done = magic.extract();
    expect(magic.phase.value).toBe("describing");
    expect(magic.startedAt.value).toBeTypeOf("number");
    await flush();
    expect(magic.phase.value).toBe("waiting");
    run.answer(answered(VERIFIED_TITLE));
    await done;

    expect(magic.phase.value).toBe("idle");
    expect(magic.startedAt.value).toBeUndefined();
    expect(magic.open.value).toBe(false);
    expect(form.model.value.title).toBe("About us");
    expect(magic.summary.value).toMatchObject({
      applied: 1,
      toFill: [],
      toReplace: [],
      unproven: [],
    });
    const request = calls.find((call) => call.path === "/_mapo/ai/run");
    expect(request?.options.body).toMatchObject({
      task: "fill",
      parts: [{ kind: "text", text: "Title: About us" }],
      instructions: "Only the title.",
      provider: { id: "ollama", model: "gemma4:12b" },
      entity: { label: "Article", model: "article" },
      existing: false,
    });
  });

  it("sends what the page says of its record at each call, not at the first", async () => {
    const PREVIEW = {
      task: "fill",
      provider: { id: "ollama", model: "gemma4:12b" },
      prompt: 1,
      instructions: "",
      parts: [],
      entities: [],
    };
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered({}),
      "/_mapo/ai/run/preview": () => PREVIEW,
    });
    const permissionModel = ref<string | undefined>("article");
    const modelName = ref<string | null>("Article");
    const { magic } = mounted(detail({ permissionModel, modelName }));
    await useMapoAiStatus().refresh();

    permissionModel.value = "news";
    modelName.value = "News";
    magic.text.value = "Title: About us";
    await magic.extract();
    await magic.loadPreview();

    for (const path of ["/_mapo/ai/run", "/_mapo/ai/run/preview"]) {
      const request = calls.find((call) => call.path === path);
      expect(request?.options.body).toMatchObject({
        entity: { label: "News", model: "news" },
      });
    }
  });

  it("stops the call on Cancel: the request is aborted, and its late answer goes nowhere", async () => {
    const run = held();
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": run.route,
    });
    const form = detail();
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";

    const done = magic.extract();
    await flush();
    magic.cancel();
    await done;

    const request = calls.find((call) => call.path === "/_mapo/ai/run");
    expect((request?.options.signal as AbortSignal).aborted).toBe(true);
    expect(magic.phase.value).toBe("idle");
    expect(magic.fill.error.value).toBeUndefined();
    run.answer(answered(VERIFIED_TITLE));
    await flush();
    expect(form.model.value.title).toBeUndefined();
  });

  it("keeps the panel open on an error, which the fill says", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => {
        throw fetchError(503);
      },
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.open.value = true;
    magic.text.value = "Title: About us";

    await magic.extract();

    expect(magic.open.value).toBe(true);
    expect(magic.fill.error.value?.status).toBe(503);
    expect(magic.phase.value).toBe("idle");
  });

  it("does nothing while a problem stands", async () => {
    const calls = gateway({ "/_mapo/ai/status": () => STATUS });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();

    await magic.extract();

    expect(calls.map((call) => call.path)).toEqual(["/_mapo/ai/status"]);
  });

  it("stops the call when the last component of the detail goes", async () => {
    const run = held();
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": run.route,
    });
    const { magic, scope } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";
    void magic.extract();
    await flush();

    scope.stop();
    await flush();

    const request = calls.find((call) => call.path === "/_mapo/ai/run");
    expect((request?.options.signal as AbortSignal).aborted).toBe(true);
  });
});

describe("useMapoAiMagicFill — the summary", () => {
  it("keeps the session's summary, and what Undo all puts back, beside a later refusal", async () => {
    let answer: unknown = answered(VERIFIED_TITLE);
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answer,
    });
    const form = detail();
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";
    await magic.extract();
    answer = {
      task: "fill",
      status: "refused",
      refusal: "No.",
      provider: { id: "ollama", model: "gemma4:12b" },
      prompt: 1,
      usage: { inputTokens: 1, outputTokens: 1 },
    };

    await magic.extract();

    expect(magic.fill.response.value?.status).toBe("refused");
    expect(magic.summary.value).toMatchObject({ applied: 1 });
    magic.undoAll();
    expect(form.model.value).toEqual({});
    expect(magic.summary.value).toBeUndefined();
  });

  it("says a value waits for a hidden field as the form is now, not as it was when the answer came", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () =>
        answered({
          notes: {
            status: "filled",
            value: "Long notes",
            verified: false,
            // A quote not found: the value waits to be confirmed, marked.
            quotes: [{ quote: "Long notes", where: "", found: false }],
          },
        }),
    });
    const fields: AnyFieldDescriptor[] = [
      { key: "kind", type: "text", label: "Kind" },
      {
        key: "notes",
        type: "text",
        label: "Notes",
        show: ({ model }) => model.kind === "long",
      },
    ];
    const form = detail({ fields: computed(() => fields) });
    form.model.value = { kind: "long" };
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Notes: Long notes";
    await magic.extract();
    expect(magic.summary.value?.toFill[0]?.reasons).toEqual(["not-proven"]);

    form.model.value.kind = "short";

    expect(magic.summary.value?.toFill[0]?.reasons).toEqual([
      "not-proven",
      "hidden",
    ]);
  });

  it("gives a value that would replace one with what the field holds now, read as the form is", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(VERIFIED_TITLE),
    });
    const form = detail({ isNew: computed(() => false) });
    form.model.value = { title: "Old title" };
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";
    await magic.extract();

    expect(magic.summary.value?.toReplace).toEqual([
      {
        key: "title",
        path: "title",
        value: "About us",
        reasons: ["replaces"],
        quote: "About us",
        current: "Old title",
      },
    ]);
  });

  it("counts a value the record already holds, and lists nothing for it", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(VERIFIED_TITLE),
    });
    const form = detail({ isNew: computed(() => false) });
    form.model.value = { title: "About us" };
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";
    await magic.extract();

    expect(magic.summary.value).toMatchObject({
      unchanged: 1,
      toFill: [],
      toReplace: [],
      unproven: [],
    });
    expect(form.annotations.value).toEqual({});
  });
});

describe("useMapoAiMagicFill — the preview's ticks", () => {
  /** An answer with a value for each group of the preview, and one for a hidden field. */
  const MIXED = {
    title: {
      status: "filled",
      value: "About us",
      verified: true,
      quotes: [{ quote: "About us", where: "", found: true }],
    },
    summary: {
      status: "filled",
      value: "A summary",
      verified: false,
      quotes: [{ quote: "A summary", where: "", found: false }],
    },
    slug: { status: "filled", value: "about-us", verified: false, quotes: [] },
    notes: {
      status: "filled",
      value: "Long notes",
      verified: false,
      quotes: [{ quote: "Long notes", where: "", found: false }],
    },
  };
  const MIXED_FIELDS: AnyFieldDescriptor[] = [
    { key: "title", type: "text", label: "Title" },
    { key: "summary", type: "text", label: "Summary" },
    { key: "slug", type: "text", label: "Slug" },
    { key: "kind", type: "text", label: "Kind" },
    {
      key: "notes",
      type: "text",
      label: "Notes",
      show: ({ model }) => model.kind === "long",
    },
  ];

  /** An existing record whose title the answer would replace, with the preview's groups. */
  async function previewed() {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(MIXED),
    });
    const form = detail({
      fields: computed(() => MIXED_FIELDS),
      isNew: computed(() => false),
    });
    form.model.value = { title: "Old title" };
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "About us";
    await magic.extract();
    return { form, magic };
  }

  it("ticks the values for empty fields the form shows, proven or not, and not a replacement, a value with no quote at all or a hidden field", async () => {
    const { magic } = await previewed();

    expect(magic.summary.value).toMatchObject({
      toFill: [{ path: "summary" }, { path: "notes" }],
      toReplace: [{ path: "title" }],
      unproven: [{ path: "slug" }],
    });
    expect(magic.selected.value).toEqual(["summary"]);
    expect(magic.isSelected("title")).toBe(false);
    expect(magic.isSelected("slug")).toBe(false);
    expect(magic.isSelected("notes")).toBe(false);
  });

  it("applies the ticked values only, and leaves the others waiting", async () => {
    const { form, magic } = await previewed();
    magic.select("title", true);
    magic.select("summary", false);
    magic.select("slug", true);

    magic.applySelected();

    expect(form.model.value).toMatchObject({
      title: "About us",
      slug: "about-us",
    });
    expect(form.model.value.summary).toBeUndefined();
    // What was not ticked keeps waiting, in the preview and on its field.
    expect(magic.summary.value).toMatchObject({
      applied: 2,
      toFill: [{ path: "summary" }, { path: "notes" }],
      toReplace: [],
      unproven: [],
    });
    expect(form.annotations.value.summary?.actions?.[0]?.label).toBe(
      "mapo.apply",
    );
  });

  it("never ticks nor writes a field the form hides", async () => {
    const { form, magic } = await previewed();

    magic.select("notes", true);
    magic.applySelected();

    expect(magic.isSelected("notes")).toBe(false);
    expect(form.model.value.notes).toBeUndefined();
  });

  it("ignores every value that waits, and leaves the values in the form", async () => {
    const { form, magic } = await previewed();
    magic.select("title", true);
    magic.select("summary", false);
    magic.applySelected();

    magic.ignoreWaiting();

    expect(form.model.value.title).toBe("About us");
    expect(magic.summary.value).toMatchObject({
      applied: 1,
      toFill: [],
      toReplace: [],
      unproven: [],
    });
    expect(Object.keys(form.annotations.value)).toEqual(["title"]);
    expect(magic.selected.value).toEqual([]);
  });

  it("starts a new value of a later answer at the same path from the preview's own tick", async () => {
    const unfound = (value: string) => ({
      status: "filled",
      value,
      verified: false,
      quotes: [{ quote: value, where: "", found: false }],
    });
    let answer = answered({ summary: unfound("A summary") });
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answer,
    });
    const fields: AnyFieldDescriptor[] = [
      { key: "summary", type: "text", label: "Summary" },
    ];
    const form = detail({ fields: computed(() => fields) });
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "A summary";
    await magic.extract();
    magic.select("summary", false);
    expect(magic.isSelected("summary")).toBe(false);
    answer = answered({ summary: unfound("Another summary") });

    await magic.extract();

    expect(magic.summary.value?.toFill).toMatchObject([
      { path: "summary", value: "Another summary" },
    ]);
    expect(magic.isSelected("summary")).toBe(true);
  });

  it("never applies a ticked value whose field another field's onChange filled meanwhile", async () => {
    const unfound = (value: string) => ({
      status: "filled",
      value,
      verified: false,
      quotes: [{ quote: value, where: "", found: false }],
    });
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () =>
        answered({ title: unfound("About us"), summary: unfound("A summary") }),
    });
    const fields: AnyFieldDescriptor[] = [
      {
        key: "title",
        type: "text",
        label: "Title",
        onChange: ({ model }) => {
          model.summary = "From the title";
        },
      },
      { key: "summary", type: "text", label: "Summary" },
    ];
    const form = detail({ fields: computed(() => fields) });
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "About us";
    await magic.extract();
    // Both for empty fields: ticked, the summary by the operator too.
    magic.select("summary", true);
    expect(magic.selected.value).toEqual(["title", "summary"]);

    magic.applySelected();

    // The title's onChange filled the summary: the AI's would replace it now.
    expect(form.model.value).toEqual({
      title: "About us",
      summary: "From the title",
    });
    expect(magic.summary.value?.toReplace).toMatchObject([
      { path: "summary", current: "From the title" },
    ]);
    expect(magic.isSelected("summary")).toBe(false);
  });

  it("starts a value restored, or a new value at the same path, from the preview's own tick", async () => {
    const { magic } = await previewed();
    magic.select("summary", false);
    magic.select("title", true);
    magic.applySelected();

    // Restore puts the old title back: its value waits again, unticked.
    magic.fill.restore("title");

    expect(magic.summary.value?.toReplace).toMatchObject([{ path: "title" }]);
    expect(magic.isSelected("title")).toBe(false);
    // The operator's untick of the summary still holds for that value.
    expect(magic.isSelected("summary")).toBe(false);
  });
});

describe("useMapoAiMagicFill — the items of a list", () => {
  const SPEAKERS: AnyFieldDescriptor[] = [
    {
      key: "speakers",
      type: "repeater",
      label: "Speakers",
      fields: [{ key: "name", type: "text", label: "Name" }],
    },
  ];
  const speaker = (name: string, verified: boolean) => ({
    fields: {
      name: {
        status: "filled",
        value: name,
        verified,
        quotes: [{ quote: name, where: "", found: verified }],
      },
    },
    verified,
  });
  const OWN = { name: "Luca", photo: 7 };

  /** A form whose speakers list holds Luca, and an answer with three speakers. */
  async function listed() {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () =>
        answered({
          speakers: {
            status: "filled",
            value: [{ name: "Anna" }, { name: "Luca" }, { name: "Marco" }],
            verified: false,
            quotes: [],
            items: [
              speaker("Anna", true),
              speaker("Luca", true),
              speaker("Marco", false),
            ],
          },
        }),
    });
    const form = detail({
      fields: computed(() => SPEAKERS),
      isNew: computed(() => false),
    });
    form.model.value = { speakers: [OWN] };
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Anna, Luca and Marco";
    await magic.extract();
    return { form, magic };
  }

  it("lists each item, ticks the verified ones the field does not hold, and never one it holds", async () => {
    const { magic } = await listed();

    expect(magic.summary.value?.toFill[0]?.list).toMatchObject([
      { index: 0, verified: true, held: false },
      { index: 1, verified: true, held: true },
      { index: 2, verified: false, held: false },
    ]);
    expect(
      [0, 1, 2].map((index) => magic.isItemSelected("speakers", index)),
    ).toEqual([true, false, false]);
    expect(magic.selected.value).toEqual(["speakers"]);
    magic.selectItem("speakers", 1, true);
    expect(magic.isItemSelected("speakers", 1)).toBe(false);
  });

  it("adds the ticked items after the field's own, and uses the list's proposal", async () => {
    const { form, magic } = await listed();
    magic.selectItem("speakers", 2, true);

    magic.applySelected();

    expect(form.model.value.speakers).toEqual([
      OWN,
      { name: "Anna" },
      { name: "Marco" },
    ]);
    expect(magic.summary.value).toMatchObject({ applied: 1, toFill: [] });
  });

  it("ticks or unticks every item a list may add with the list's own tick", async () => {
    const { magic } = await listed();

    magic.select("speakers", false);
    expect(magic.isSelected("speakers")).toBe(false);
    magic.select("speakers", true);

    expect(
      [0, 1, 2].map((index) => magic.isItemSelected("speakers", index)),
    ).toEqual([true, false, true]);
  });

  it("brings the list's proposal back with Restore, from the preview's own ticks", async () => {
    const { form, magic } = await listed();
    magic.selectItem("speakers", 2, true);
    magic.applySelected();

    magic.fill.restore("speakers");

    expect(form.model.value.speakers).toEqual([OWN]);
    expect(magic.summary.value?.toFill).toMatchObject([{ path: "speakers" }]);
    expect(
      [0, 1, 2].map((index) => magic.isItemSelected("speakers", index)),
    ).toEqual([true, false, false]);
  });

  it("names an item by its template's label and its first values", async () => {
    const { magic } = await listed();
    const blocks: AnyFieldDescriptor = {
      key: "blocks",
      type: "repeater",
      label: "Blocks",
      attrs: { templates: { hero: { label: "Hero", fields: [] } } },
    };
    const fields = [...SPEAKERS, blocks];
    const other = detail({ fields: computed(() => fields) });
    const { magic: again } = mounted(other);

    expect(
      magic.itemLabelOf("speakers", {
        index: 0,
        value: { name: "Anna" },
        verified: true,
        held: false,
      }),
    ).toBe("Anna");
    expect(
      again.itemLabelOf("blocks", {
        index: 1,
        value: { _template: "hero", title: "Welcome", subtitle: "To us" },
        template: "hero",
        verified: false,
        held: false,
      }),
    ).toBe("Hero · Welcome · To us");
    expect(
      again.itemLabelOf("blocks", {
        index: 2,
        value: {},
        verified: false,
        held: false,
      }),
    ).toBe("#3");
  });
});

describe("useMapoAiMagicFill — files", () => {
  it("reads each file through read, and sends its parts after the pasted text", async () => {
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/read": () => ({
        status: "read",
        reader: "text",
        parts: [{ kind: "text", text: "Hello", name: "a.txt" }],
      }),
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.text.value = "Pasted";

    magic.attach([new File(["Hello"], "a.txt", { type: "text/plain" })]);
    expect(magic.files.value[0]?.state).toBe("reading");
    await flush();

    expect(magic.files.value).toMatchObject([
      { name: "a.txt", state: "read", chars: 5 },
    ]);
    expect(magic.parts.value).toEqual([
      { kind: "text", text: "Pasted" },
      { kind: "text", text: "Hello", name: "a.txt" },
    ]);
    expect(calls.filter((call) => call.path === "/_mapo/ai/read")).toHaveLength(
      1,
    );
  });

  it("refuses a file larger than the limit before sending it, and says what became of the others", async () => {
    const answers = [
      () => ({ status: "unsupported" }),
      () => ({ status: "too-long", reader: "text", chars: 999 }),
      () => {
        throw fetchError(413);
      },
      () => {
        throw fetchError(500);
      },
    ];
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/read": () => answers.shift()?.(),
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();

    magic.attach([new File(["x".repeat(1001)], "big.txt")]);
    for (const name of ["a.pdf", "b.txt", "c.txt", "d.txt"]) {
      magic.attach([new File(["x"], name)]);
      await flush();
    }

    expect(magic.files.value.map((file) => [file.name, file.state])).toEqual([
      ["big.txt", "too-large"],
      ["a.pdf", "unsupported"],
      ["b.txt", "too-long"],
      ["c.txt", "too-large"],
      ["d.txt", "failed"],
    ]);
    expect(calls.filter((call) => call.path === "/_mapo/ai/read")).toHaveLength(
      4,
    );
    expect(magic.parts.value).toEqual([]);
  });

  it("stops reading a file removed meanwhile", async () => {
    const read = held();
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/read": read.route,
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.attach([new File(["Hello"], "a.txt")]);
    const [file] = magic.files.value;

    magic.detach(file!.id);

    const request = calls.find((call) => call.path === "/_mapo/ai/read");
    expect((request?.options.signal as AbortSignal).aborted).toBe(true);
    expect(magic.files.value).toEqual([]);
  });
});

describe("useMapoAiMagicFill — What I send to the AI", () => {
  const PREVIEW = {
    task: "fill",
    provider: { id: "ollama", model: "gemma4:12b" },
    prompt: 1,
    instructions: "# Rules (Mapo, version 1)",
    parts: [{ chars: 0 }],
    entities: [{ label: "Article", fields: [{ key: "title" }], skipped: [] }],
  };

  it("asks run/preview what a call would send now, with an empty part before any source", async () => {
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run/preview": () => PREVIEW,
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();

    await magic.loadPreview();

    expect(magic.preview.value).toEqual({
      state: "ready",
      answer: PREVIEW,
      stale: false,
    });
    const request = calls.find((call) => call.path === "/_mapo/ai/run/preview");
    expect(request?.options.body).toMatchObject({
      task: "fill",
      parts: [{ kind: "text", text: "" }],
      provider: { id: "ollama", model: "gemma4:12b" },
      entity: { label: "Article", model: "article" },
    });
  });

  it("says the preview is stale once what a call would send changes, and asks again only when told", async () => {
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run/preview": () => PREVIEW,
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    const previews = () =>
      calls.filter((call) => call.path === "/_mapo/ai/run/preview").length;

    await magic.loadPreview();
    expect(magic.preview.value.stale).toBe(false);

    magic.text.value = "Title: About us";
    expect(magic.preview.value.stale).toBe(true);
    await flush();
    expect(previews()).toBe(1);

    await magic.loadPreview();
    expect(magic.preview.value.stale).toBe(false);
    expect(previews()).toBe(2);

    magic.instructions.value = "Keep it short";
    expect(magic.preview.value.stale).toBe(true);
    await magic.loadPreview();
    magic.choice.value = magic.choices.value.find(
      (one) => one.model === "qwen3.8:27b",
    );
    expect(magic.preview.value.stale).toBe(true);
  });

  it("says why the preview failed, as the fill would", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run/preview": () => {
        throw fetchError(403);
      },
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();

    await magic.loadPreview();

    expect(magic.preview.value).toEqual({
      state: "failed",
      error: "mapo.ai.errors.forbidden",
      stale: false,
    });
  });
});

describe("useMapoAiMagicFill — labels", () => {
  it("names a field as the form does, and a part of a field after it", () => {
    gateway({});
    const { magic } = mounted(detail());

    expect(magic.labelOf("title")).toBe("Title");
    expect(magic.labelOf("seo.title")).toBe("Seo Title");
    expect(magic.labelOf("seo.title.main")).toBe("Seo Title · Main");
    expect(magic.labelOf("unknown_key")).toBe("Unknown Key");
  });
});

describe("useMapoAiMagicFill — the page's draft", () => {
  type Part = { save: () => unknown; restore: (data: unknown) => void };

  /** A page's draft: the parts registered, and the calls to save soon. */
  function pageDraft() {
    const parts = new Map<string, Part>();
    const touch = vi.fn();
    const draft = {
      part: (key: string, part: Part) => {
        parts.set(key, part);
        return () => {
          parts.delete(key);
        };
      },
      touch,
    };
    return { parts, touch, draft };
  }

  it("keeps the session as a part of the draft, saved at each change, and leaves with the state", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(VERIFIED_TITLE),
    });
    const page = pageDraft();
    const { magic, scope } = mounted(detail({ draft: page.draft }));
    await useMapoAiStatus().refresh();
    const part = page.parts.get("mapo-ai-magic-fill");
    expect(part?.save()).toBeUndefined();

    magic.text.value = "Title: About us";
    await magic.extract();
    await flush();

    expect(page.touch).toHaveBeenCalled();
    expect(part?.save()).toMatchObject({
      format: 2,
      rounds: 1,
      answers: [{ provider: { id: "ollama", model: "gemma4:12b" } }],
    });
    scope.stop();
    await flush();
    expect(page.parts.has("mapo-ai-magic-fill")).toBe(false);
  });

  it("takes the session back when the page restores its draft, in place of a call under way", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(VERIFIED_TITLE),
    });
    const first = pageDraft();
    const { magic: before } = mounted(detail({ draft: first.draft }));
    await useMapoAiStatus().refresh();
    before.text.value = "Title: About us";
    await before.extract();
    const kept: unknown = JSON.parse(
      JSON.stringify(first.parts.get("mapo-ai-magic-fill")?.save()),
    );

    // The page loads again: its draft puts the values back, then the parts.
    const run = held();
    gateway({ "/_mapo/ai/status": () => STATUS, "/_mapo/ai/run": run.route });
    const page = pageDraft();
    const form = detail({ draft: page.draft });
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: Contacts";
    const call = magic.extract();
    await flush();
    expect(magic.phase.value).toBe("waiting");

    form.model.value = { title: "About us" };
    page.parts.get("mapo-ai-magic-fill")?.restore(kept);
    await call;
    await flush();

    expect(magic.phase.value).toBe("idle");
    expect(magic.fill.rounds.value).toBe(1);
    expect(magic.summary.value).toMatchObject({ applied: 1 });
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.applied");
    magic.undoAll();
    expect(form.model.value).toEqual({});
  });
  it("takes the session back on the fields the record's description gives, once it answers", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(VERIFIED_TITLE),
    });
    const first = pageDraft();
    const { magic: before } = mounted(detail({ draft: first.draft }));
    await useMapoAiStatus().refresh();
    before.text.value = "Title: About us";
    await before.extract();
    const kept: unknown = JSON.parse(
      JSON.stringify(first.parts.get("mapo-ai-magic-fill")?.save()),
    );

    // A page whose fields come from OPTIONS: none until it answers.
    const described = ref<AnyFieldDescriptor[]>([]);
    let answer: () => void = () => undefined;
    const page = pageDraft();
    const form = detail({
      draft: page.draft,
      fields: computed(() => described.value),
      metadata: vi.fn(
        () =>
          new Promise<Record<string, unknown> | undefined>((resolve) => {
            answer = () => {
              described.value = FIELDS;
              resolve(undefined);
            };
          }),
      ),
    });
    const { magic } = mounted(form);
    form.model.value = { title: "About us" };
    page.parts.get("mapo-ai-magic-fill")?.restore(kept);
    await flush();
    expect(magic.fill.rounds.value).toBe(0);

    answer();
    await flush();

    expect(magic.fill.fields.value.map((one) => one.path)).toEqual(["title"]);
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.applied");
  });
});

describe("useMapoAiMagicFill — the page's options", () => {
  it("asks for no quotes on a page that turns its proofs off, and lists a value without any to fill", async () => {
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () =>
        answered({
          title: {
            status: "filled",
            value: "About us",
            verified: false,
            quotes: [],
          },
        }),
    });
    nuxt.app.$router = {
      currentRoute: ref({ meta: { magicFill: { evidence: false } } }),
    };
    const form = detail();
    const { magic } = mounted(form);
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";

    await magic.extract();

    const request = calls.find((call) => call.path === "/_mapo/ai/run");
    expect(request?.options.body).toMatchObject({
      entity: { label: "Article", model: "article", evidence: false },
    });
    // No quote was asked: the value is no proposal without proof, and its
    // field is marked.
    expect(magic.summary.value?.unproven).toEqual([]);
    expect(magic.summary.value?.toFill.map((item) => item.path)).toEqual([
      "title",
    ]);
    expect(form.annotations.value.title?.description).toContain(
      "mapo.ai.fill.notAsked",
    );
  });

  it("asks for quotes on a page that leaves its proofs on", async () => {
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered({}),
    });
    nuxt.app.$router = { currentRoute: ref({ meta: { magicFill: true } }) };
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.text.value = "Title: About us";

    await magic.extract();

    const request = calls.find((call) => call.path === "/_mapo/ai/run");
    const body = request?.options.body as { entity: Record<string, unknown> };
    expect(body.entity).not.toHaveProperty("evidence");
  });
});

describe("useMapoAiMagicFill — next to check", () => {
  const WAITING = {
    title: {
      status: "filled",
      value: "About us",
      verified: false,
      quotes: [{ quote: "About us", where: "", found: false }],
    },
    "seo.title": {
      status: "filled",
      value: "About us, the company",
      verified: false,
      quotes: [{ quote: "About us, the company", where: "", found: false }],
    },
  };

  it("takes the operator to each mark that waits, in the form's order, and around again", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(WAITING),
    });
    const revealField = vi.fn(async (_path: string) => true);
    const { magic } = mounted(detail({ revealField }));
    await useMapoAiStatus().refresh();
    magic.text.value = "x";

    await magic.extract();

    expect(magic.canReveal).toBe(true);
    expect(magic.toCheck.value).toEqual(["title", "seo.title"]);
    await expect(magic.nextToCheck()).resolves.toBe(true);
    await magic.nextToCheck();
    await magic.nextToCheck();
    expect(revealField.mock.calls.map(([path]) => path)).toEqual([
      "title",
      "seo.title",
      "title",
    ]);
  });

  it("offers nothing on a page that cannot take the operator to a field", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => answered(WAITING),
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    magic.text.value = "x";

    await magic.extract();

    expect(magic.canReveal).toBe(false);
    await expect(magic.nextToCheck()).resolves.toBe(false);
  });
});

describe("useMapoAiMagicFill — a refusal before any call", () => {
  it("asks status again when the gateway says the key or the model went away", async () => {
    const calls = gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () => {
        throw Object.assign(fetchError(503), {
          data: { statusCode: 503, data: { reason: "no-key" } },
        });
      },
    });
    const { magic } = mounted(detail());
    await useMapoAiStatus().refresh();
    const asked = () =>
      calls.filter((call) => call.path === "/_mapo/ai/status").length;
    const before = asked();
    magic.text.value = "x";

    await magic.extract();
    await flush();

    expect(magic.fill.error.value?.message).toBe("mapo.ai.errors.noKey");
    expect(asked()).toBe(before + 1);
  });
});

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
    expect(magic.summary.value).toMatchObject({ applied: 1, toConfirm: [] });
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
  it("says a value waits for a hidden field as the form is now, not as it was when the answer came", async () => {
    gateway({
      "/_mapo/ai/status": () => STATUS,
      "/_mapo/ai/run": () =>
        answered({
          notes: {
            status: "filled",
            value: "Long notes",
            verified: false,
            quotes: [],
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
    expect(magic.summary.value?.toConfirm[0]?.reasons).toEqual(["not-proven"]);

    form.model.value.kind = "short";

    expect(magic.summary.value?.toConfirm[0]?.reasons).toEqual([
      "not-proven",
      "hidden",
    ]);
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

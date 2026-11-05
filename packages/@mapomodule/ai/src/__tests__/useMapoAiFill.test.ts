import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";
import type {
  AnyFieldDescriptor,
  FieldAnnotations,
} from "@mapomodule/form/types";
import { valuePath } from "@mapomodule/form/runtime/utils/annotations";
import { useMapoAiFill } from "../runtime/composables/useMapoAiFill";
import type { MapoAiFillTarget } from "../runtime/composables/useMapoAiFill";
import type { AiFieldOutcome, AiValue } from "../runtime/shared/sanitize";

/** What the mocked `useNuxtApp()` returns: `$mapoFetch` and `$i18n` of the test. */
const nuxt = vi.hoisted(() => {
  const state: { app: Record<string, unknown> } = { app: {} };
  return state;
});

vi.mock("nuxt/app", () => ({ useNuxtApp: () => nuxt.app }));

type Post = (
  path: string,
  options: Record<string, unknown>,
) => Promise<unknown>;

/** A `t()` that writes the key and its values, so a test sees both. */
function t(key: string, params: Record<string, unknown> = {}): string {
  const values = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  return values.length
    ? `${key} ${JSON.stringify(Object.fromEntries(values))}`
    : key;
}

function filled(value: AiValue, verified = true): AiFieldOutcome {
  return {
    status: "filled",
    value,
    verified,
    quotes: [
      { quote: `Quote of ${String(value)}`, where: "", found: verified },
    ],
  };
}

function answered(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    task: "fill",
    status: "answered",
    result: { readable: true, fields, warnings: [] },
    provider: { id: "mock", model: "mock" },
    prompt: 1,
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

/**
 * A failure as `$fetch` rejects with it: a status, the answer's headers,
 * and the answer itself in `data`, as the server sends an error.
 */
function fetchError(
  status: number,
  headers: Record<string, string> = {},
  data?: Record<string, unknown>,
): Error {
  return Object.assign(new Error(`[POST] "/_mapo/ai/run": ${status}`), {
    statusCode: status,
    response: new Response(null, { status, headers }),
    ...(data ? { data: { error: true, statusCode: status, data } } : {}),
  });
}

const FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title" },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
  { key: "subtitle", type: "text", label: "Subtitle", translatable: true },
];

/** A detail form, shaped as `useMapoDetail()` gives it. */
function target(model: Record<string, unknown> = {}) {
  return {
    model: ref(model),
    fields: computed(() => FIELDS),
    sidebarFields: computed((): AnyFieldDescriptor[] => [
      { key: "status", type: "select", label: "Status" },
    ]),
    annotations: ref<FieldAnnotations>({}),
    metadata: vi.fn(
      async (): Promise<Record<string, unknown> | undefined> => ({
        actions: {
          POST: { title: { type: "string", label: "Title", max_length: 200 } },
        },
      }),
    ),
    isNew: computed(() => false),
    currentLang: ref("it"),
    readonly: ref(false),
  } satisfies MapoAiFillTarget;
}

/** `$mapoFetch` answering `answer`, or rejecting with it when it is an error. */
function serve(answer: unknown): ReturnType<typeof vi.fn<Post>> {
  const post = vi.fn<Post>(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  nuxt.app = { $mapoFetch: post, $i18n: { t } };
  return post;
}

beforeEach(() => {
  nuxt.app = {};
  vi.unstubAllGlobals();
});

describe("useMapoAiFill — the request", () => {
  it("sends the form's fields, the backend's schema from OPTIONS, the language and whether the record exists", async () => {
    const post = serve(answered({}));
    const form = target();

    await useMapoAiFill(form, {
      entity: { label: "Article", model: "article" },
    }).fill("Title: About us", { instructions: "Only the title." });

    expect(post).toHaveBeenCalledOnce();
    const [path, options] = post.mock.calls[0] ?? [];
    expect(path).toBe("/_mapo/ai/run");
    expect(options).toMatchObject({
      method: "POST",
      body: {
        task: "fill",
        entity: {
          label: "Article",
          model: "article",
          fields: {
            properties: {
              title: { title: "Title" },
              status: { title: "Status" },
            },
          },
          schema: { properties: { title: { maxLength: 200 } } },
        },
        existing: true,
        language: "it",
        instructions: "Only the title.",
        parts: [{ kind: "text", text: "Title: About us" }],
      },
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reads the backend's schema with schemaFromMetadata", async () => {
    const post = serve(answered({}));
    const schema = {
      type: "object",
      properties: { title: { type: "string" } },
    };

    await useMapoAiFill(target(), { schemaFromMetadata: () => schema }).fill(
      "x",
    );

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      body: { entity: { schema } },
    });
  });

  it("describes the record with its fields alone when OPTIONS fails", async () => {
    const post = serve(answered({}));
    const form = target();
    form.metadata.mockRejectedValue(new Error("Network"));

    await useMapoAiFill(form).fill("x");

    const body = post.mock.calls[0]?.[1]?.body;
    expect(body).toMatchObject({ entity: { fields: { type: "object" } } });
    expect(body).not.toHaveProperty("entity.schema");
  });

  it("asks nothing of a form that cannot be edited", async () => {
    const post = serve(answered({}));
    const form = target();
    form.readonly.value = true;

    await useMapoAiFill(form).fill("x");

    expect(post).not.toHaveBeenCalled();
  });

  it("posts with $fetch when the app has no $mapoFetch", async () => {
    const fetch = vi.fn(async () => answered({}));
    vi.stubGlobal("$fetch", fetch);
    nuxt.app = {};

    await useMapoAiFill(target()).fill("x");

    expect(fetch).toHaveBeenCalledWith("/_mapo/ai/run", expect.anything());
  });
});

describe("useMapoAiFill — the answer in the form", () => {
  it("writes a verified value into an empty field, and leaves the others to the operator", async () => {
    serve(
      answered({
        title: filled("About us"),
        excerpt: filled("Ours", false),
        subtitle: filled("Chi siamo"),
        status: {
          status: "discarded",
          reason: "not-listed",
          proposed: "archived",
          quotes: [],
        },
      }),
    );
    const form = target({ status: "draft" });
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value).toEqual({
      title: "About us",
      status: "draft",
      translations: { it: { subtitle: "Chi siamo" } },
    });
    expect(
      ai.fields.value.map((field) => [field.path, field.action, field.applied]),
    ).toEqual([
      ["title", "apply", true],
      ["excerpt", "confirm", false],
      ["translations.it.subtitle", "apply", true],
      ["status", "discard", false],
    ]);
    const marks = form.annotations.value;
    expect(marks.title).toMatchObject({
      label: "mapo.ai.fill.applied",
      color: "success",
      description: 'mapo.ai.fill.proven {"quote":"Quote of About us"}',
    });
    expect(marks.excerpt).toMatchObject({
      label: "mapo.ai.fill.confirm",
      dot: true,
      description:
        'mapo.ai.fill.proposes {"value":"Ours"} mapo.ai.fill.notProven',
    });
    expect(marks.status).toMatchObject({
      label: "mapo.ai.fill.discarded",
      description: 'mapo.ai.fill.reasons.not-listed {"value":"archived"}',
    });
  });

  it("never writes a verified value over one the form holds", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value.title).toBe("Home");
    expect(form.annotations.value.title?.description).toBe(
      'mapo.ai.fill.proposesInstead {"value":"About us"} mapo.ai.fill.proven {"quote":"Quote of About us"}',
    );
  });

  it("applies a waiting value, and restores what the field held", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    form.annotations.value.title?.actions?.[0]?.onClick();
    expect(form.model.value.title).toBe("About us");
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.applied");

    ai.restore("title");
    expect(form.model.value.title).toBe("Home");
    expect(ai.fields.value[0]?.applied).toBe(false);
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.confirm");
  });

  it("leaves a related record for the operator to choose", async () => {
    serve(answered({ title: filled({ search: "News" }) }));
    const form = target();
    const ai = useMapoAiFill(form);

    await ai.fill("x");
    ai.apply("title");

    expect(form.model.value).toEqual({});
    expect(form.annotations.value.title).toMatchObject({
      label: "mapo.ai.fill.manual",
      description: 'mapo.ai.fill.manualText {"value":"News"}',
    });
  });

  it("undoes every value it wrote, and removes only its own marks", async () => {
    serve(
      answered({ title: filled("About us"), excerpt: filled("Ours", false) }),
    );
    const form = target({ excerpt: "" });
    const other = { label: "Reviewed" };
    form.annotations.value = { subtitle: other };
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    ai.apply("excerpt");

    ai.undo();

    expect(form.model.value).toEqual({ excerpt: "" });
    expect(Object.hasOwn(form.model.value, "title")).toBe(false);
    expect(form.annotations.value).toEqual({ subtitle: other });
    expect(ai.fields.value.every((field) => !field.applied)).toBe(true);
  });

  it("removes its marks when asked, and keeps the values", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    ai.dismiss();

    expect(form.annotations.value).toEqual({});
    expect(form.model.value.title).toBe("About us");
  });

  it("writes nothing while the detail saves, and lets the operator apply afterwards", async () => {
    serve(answered({ title: filled("About us") }));
    const form = { ...target(), isBusy: ref(true) };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value).toEqual({});
    expect(ai.fields.value[0]).toMatchObject({
      action: "apply",
      applied: false,
    });
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.confirm");
    form.isBusy.value = false;
    form.annotations.value.title?.actions?.[0]?.onClick();
    expect(form.model.value.title).toBe("About us");
  });

  it("writes nothing more into a form that became read-only", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    form.readonly.value = true;

    ai.apply("title");
    ai.undo();

    expect(form.model.value.title).toBe("Home");
  });

  it("shows the refusal of the model, with nothing written", async () => {
    serve({
      task: "fill",
      status: "refused",
      refusal: "No.",
      provider: { id: "mock", model: "mock" },
      prompt: 1,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const form = target();
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(ai.response.value?.status).toBe("refused");
    expect(ai.fields.value).toEqual([]);
    expect(ai.error.value).toBeUndefined();
    expect(form.model.value).toEqual({});
  });

  it("writes a value where the form reads it: a translatable one in the form's language, an object's inside it", async () => {
    serve(
      answered({
        subtitle: filled("Chi siamo"),
        "seo.title": filled("About us"),
      }),
    );
    const form = target();
    const seo: AnyFieldDescriptor = { key: "seo", type: "seo", label: "SEO" };
    form.fields = computed(() => [...FIELDS, seo]);
    const subtitle = FIELDS.find((field) => field.key === "subtitle");
    if (!subtitle) throw new Error("No subtitle field");
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(ai.fields.value.map((field) => field.path)).toEqual([
      valuePath(subtitle, "it"),
      "seo.title",
    ]);
    expect(form.model.value).toEqual({
      translations: { it: { subtitle: "Chi siamo" } },
      seo: { title: "About us" },
    });
  });

  it("labels its marks with the message keys when the app has no i18n", async () => {
    const post = vi.fn(async () => answered({ title: filled("About us") }));
    nuxt.app = { $mapoFetch: post };
    const form = target();

    await useMapoAiFill(form).fill("x");

    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.applied");
  });
});

describe("useMapoAiFill — waiting and failing", () => {
  it("stops waiting when cancelled, and drops the late answer", async () => {
    let answer: (value: unknown) => void = () => {};
    let signal: AbortSignal | undefined;
    nuxt.app = {
      $mapoFetch: (_path: string, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise((resolve) => (answer = resolve));
      },
      $i18n: { t },
    };
    const form = target();
    const ai = useMapoAiFill(form);

    const filling = ai.fill("x");
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(ai.pending.value).toBe(true);
    ai.cancel();
    answer(answered({ title: filled("About us") }));
    await filling;

    expect(signal?.aborted).toBe(true);
    expect(ai.pending.value).toBe(false);
    expect(ai.error.value).toBeUndefined();
    expect(form.model.value).toEqual({});
  });

  it("keeps only the answer of the last call", async () => {
    const answers: Array<(value: unknown) => void> = [];
    nuxt.app = {
      $mapoFetch: () => new Promise((resolve) => answers.push(resolve)),
      $i18n: { t },
    };
    const form = target();
    const ai = useMapoAiFill(form);

    const first = ai.fill("first");
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    const second = ai.fill("second");
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    answers[1]?.(answered({ title: filled("Second") }));
    answers[0]?.(answered({ title: filled("First") }));
    await Promise.all([first, second]);

    expect(form.model.value.title).toBe("Second");
  });

  it("stops waiting when the component that called it goes away", async () => {
    let signal: AbortSignal | undefined;
    nuxt.app = {
      $mapoFetch: (_path: string, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    };
    const scope = effectScope();
    const ai = scope.run(() => useMapoAiFill(target()));

    void ai?.fill("x");
    await vi.waitFor(() => expect(signal).toBeDefined());
    scope.stop();

    expect(signal?.aborted).toBe(true);
  });

  it("says how long to wait when the user's limit is reached", async () => {
    serve(fetchError(429, { "retry-after": "42" }));
    const ai = useMapoAiFill(target());

    await ai.fill("x");

    expect(ai.error.value).toEqual({
      status: 429,
      message: 'mapo.ai.errors.rateLimitedIn {"seconds":42}',
      retryAfter: 42,
    });
    expect(ai.pending.value).toBe(false);
  });

  it("names each failure of the gateway", async () => {
    const cases: Array<[Error, string]> = [
      [fetchError(503), "mapo.ai.errors.unavailable"],
      [fetchError(504), "mapo.ai.errors.timeout"],
      [fetchError(413), "mapo.ai.errors.tooLarge"],
      [fetchError(502, {}, { failure: "truncated" }), "mapo.ai.errors.cutOff"],
      [
        fetchError(413, {}, { failure: "too-long" }),
        "mapo.ai.errors.tooLongForModel",
      ],
      [
        fetchError(502, {}, { failure: "unavailable" }),
        "mapo.ai.errors.providerFailed",
      ],
      [
        fetchError(502, {}, { failure: "constructor" }),
        "mapo.ai.errors.providerFailed",
      ],
      [fetchError(422), "mapo.ai.errors.nothingToFill"],
      [fetchError(403), "mapo.ai.errors.forbidden"],
      [fetchError(500), "mapo.ai.errors.failed"],
      [
        Object.assign(new Error("fetch failed"), { name: "FetchError" }),
        "mapo.ai.errors.network",
      ],
      [new Error("Something else"), "mapo.ai.errors.failed"],
    ];
    for (const [failure, message] of cases) {
      serve(failure);
      const ai = useMapoAiFill(target());

      await ai.fill("x");

      expect(ai.error.value?.message).toBe(message);
    }
  });

  it("says when the server's answer cannot be read", async () => {
    serve({ ok: true });
    const form = target();
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(ai.error.value).toEqual({
      status: 0,
      message: "mapo.ai.errors.badAnswer",
    });
    expect(form.model.value).toEqual({});
  });
});

describe("useMapoAiFill — the operator's own changes", () => {
  it("leaves alone, on undo, a field the operator changed after the AI", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    form.model.value.title = "About us, Milan";

    ai.undo();

    expect(form.model.value.title).toBe("About us, Milan");
    expect(ai.fields.value[0]?.applied).toBe(false);
  });

  it("restores what the field held just before the AI's last value went in", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    ai.apply("title");
    ai.restore("title");
    form.model.value.title = "Homepage";
    ai.apply("title");

    ai.restore("title");

    expect(form.model.value.title).toBe("Homepage");
  });

  it("undoes exactly: a key the AI added goes away, and so do the objects it made", async () => {
    serve(
      answered({ title: filled("About us"), subtitle: filled("Chi siamo") }),
    );
    const original = { translations: { en: { subtitle: "Who we are" } } };
    const form = target(structuredClone(original));
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    expect(form.model.value).toMatchObject({
      title: "About us",
      translations: { it: { subtitle: "Chi siamo" } },
    });

    ai.undo();

    expect(form.model.value).toEqual(original);
    expect(Object.hasOwn(form.model.value, "title")).toBe(false);
  });
});

describe("useMapoAiFill — a call that fails", () => {
  it("keeps the previous answer when the next call fails", async () => {
    const post = serve(
      answered({ title: filled("About us"), excerpt: filled("Ours", false) }),
    );
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("first");
    post.mockRejectedValueOnce(fetchError(429, { "retry-after": "10" }));

    await ai.fill("second");

    expect(ai.error.value?.status).toBe(429);
    expect(ai.fields.value).toHaveLength(2);
    expect(form.annotations.value.excerpt?.label).toBe("mapo.ai.fill.confirm");
    ai.undo();
    expect(form.model.value).toEqual({});
  });

  it("keeps the previous answer when the next call is cancelled", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("first");
    post.mockImplementationOnce(() => new Promise(() => {}));

    const second = ai.fill("second");
    ai.cancel();
    await second;

    expect(ai.fields.value).toHaveLength(1);
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.applied");
  });

  it("names a failure of the app's own code apart from the network", async () => {
    serve(answered({}));
    const ai = useMapoAiFill(target(), {
      schemaFromMetadata: () => {
        throw new Error("Broken");
      },
    });

    await ai.fill("x");

    expect(ai.error.value?.message).toBe("mapo.ai.errors.failed");
  });
});

describe("useMapoAiFill — the form's own rules", () => {
  it("reads the form's language once OPTIONS answered, as a detail that takes its languages from there", async () => {
    const post = serve(answered({ subtitle: filled("Chi siamo") }));
    const form = { ...target(), currentLang: ref("") };
    form.metadata.mockImplementation(async () => {
      form.currentLang.value = "it";
      return {};
    });

    await useMapoAiFill(form).fill("x");

    expect(post.mock.calls[0]?.[1]).toMatchObject({ body: { language: "it" } });
    expect(form.model.value).toEqual({
      translations: { it: { subtitle: "Chi siamo" } },
    });
  });

  it("writes as the form does: through the accessor, in every language for synci18n, then onChange", async () => {
    serve(
      answered({
        tags: filled(["a", "b"]),
        slug: filled("about-us"),
        title: filled("About us"),
      }),
    );
    const onChange = vi.fn();
    const fields: AnyFieldDescriptor[] = [
      {
        key: "tags",
        type: "text",
        label: "Tags",
        accessor: {
          get: ({ val }) => String(val ?? "").split(","),
          set: ({ val }) => (Array.isArray(val) ? val.join(",") : val),
        },
      },
      { key: "slug", type: "text", label: "Slug", synci18n: true },
      { key: "title", type: "text", label: "Title", onChange },
    ];
    const form = {
      ...target(),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
      languages: computed(() => ["en", "it"]),
    };

    await useMapoAiFill(form).fill("x");

    expect(form.model.value).toEqual({
      tags: "a,b",
      translations: { en: { slug: "about-us" }, it: { slug: "about-us" } },
      title: "About us",
    });
    expect(onChange).toHaveBeenCalledWith({
      model: form.model.value,
      val: "About us",
    });
  });

  it("converts with the accessor the registry gives the field's type", async () => {
    serve(answered({ tags: filled(["a", "b"]) }));
    const fields: AnyFieldDescriptor[] = [
      { key: "tags", type: "csv", label: "Tags" },
    ];
    const form = {
      ...target(),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
      registry: computed(() => ({
        mapping: {},
        attrs: {},
        accessor: {
          csv: {
            set: ({ val }: { val: unknown }) =>
              Array.isArray(val) ? val.join(",") : val,
          },
        },
      })),
    };

    await useMapoAiFill(form).fill("x");

    expect(form.model.value).toEqual({ tags: "a,b" });
  });

  it("marks the parts of an object at the field, where the form shows a mark", async () => {
    serve(
      answered({
        "seo.title": filled("About us"),
        "seo.description": filled("Who we are", false),
      }),
    );
    const form = {
      ...target(),
      fields: computed((): AnyFieldDescriptor[] => [
        { key: "seo", type: "seo", label: "SEO" },
      ]),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(Object.keys(form.annotations.value)).toEqual(["seo"]);
    const mark = form.annotations.value.seo;
    expect(mark?.label).toBe("mapo.ai.fill.confirm");
    expect(mark?.description).toContain("title: ");
    expect(mark?.description).toContain("description: ");
    expect(form.model.value).toEqual({ seo: { title: "About us" } });
    mark?.actions?.[0]?.onClick();
    expect(form.model.value).toEqual({
      seo: { title: "About us", description: "Who we are" },
    });
    expect(form.annotations.value.seo?.label).toBe("mapo.ai.fill.applied");
  });

  it("proves a verified list by the quotes of its items, and says what was taken out", async () => {
    const item = { fields: { name: filled("Ada") }, verified: true };
    serve(
      answered({
        speakers: {
          status: "filled",
          value: [{ name: "Ada" }],
          verified: true,
          quotes: [],
          items: [item],
        },
        guests: {
          status: "filled",
          value: ["Bob"],
          verified: false,
          quotes: [{ quote: "Bob", where: "", found: true }],
          dropped: [{ proposed: "Eve", reason: "not-listed" }],
        },
      }),
    );
    const form = {
      ...target(),
      fields: computed((): AnyFieldDescriptor[] => [
        {
          key: "speakers",
          type: "repeater",
          label: "Speakers",
          attrs: { fields: [{ key: "name", type: "text", label: "Name" }] },
        },
        { key: "guests", type: "select", label: "Guests" },
      ]),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };

    await useMapoAiFill(form).fill("x");

    expect(form.annotations.value.speakers).toMatchObject({
      color: "success",
      description: 'mapo.ai.fill.proven {"quote":"Quote of Ada"}',
    });
    expect(form.annotations.value.guests?.description).toContain(
      'mapo.ai.fill.dropped {"n":1}',
    );
  });

  it("writes no key the form's fields do not declare", async () => {
    serve(answered({ "title.x": filled("A"), "speakers.length": filled(0) }));
    const form = {
      ...target({ speakers: [{ name: "Ada" }] }),
      fields: computed((): AnyFieldDescriptor[] => [
        { key: "title", type: "text", label: "Title" },
        { key: "speakers", type: "repeater", label: "Speakers" },
      ]),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");
    ai.apply("speakers.length");

    expect(form.model.value).toEqual({ speakers: [{ name: "Ada" }] });
    expect(ai.fields.value).toEqual([]);
  });

  it("never puts a value by itself into a field the form hides", async () => {
    serve(answered({ external_url: filled("https://example.com") }));
    const form = {
      ...target(),
      fields: computed((): AnyFieldDescriptor[] => [
        { key: "kind", type: "text", label: "Kind" },
        {
          key: "external_url",
          type: "url",
          label: "Link",
          show: ({ model }) => model.kind === "link",
        },
      ]),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value).toEqual({});
    expect(ai.fields.value[0]).toMatchObject({
      action: "confirm",
      shown: false,
    });
  });

  it("names a listed record by its label", async () => {
    serve(answered({ category: filled({ id: 3 }) }));
    const form = {
      ...target(),
      fields: computed((): AnyFieldDescriptor[] => [
        { key: "category", type: "fks", label: "Category" },
      ]),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };

    await useMapoAiFill(form, {
      entity: {
        relationChoices: { category: [{ value: 3, label: "Culture" }] },
      },
    }).fill("x");

    expect(form.annotations.value.category?.description).toBe(
      'mapo.ai.fill.manualText {"value":"Culture"}',
    );
  });

  it("takes a detail whose model is an interface", async () => {
    interface Article {
      title?: string;
    }
    serve(answered({ title: filled("About us") }));
    const model = ref<Article>({});
    const form: MapoAiFillTarget<Article> = {
      model,
      fields: computed((): AnyFieldDescriptor<Article>[] => [
        { key: "title", type: "text", label: "Title" },
      ]),
      annotations: ref<FieldAnnotations>({}),
    };

    await useMapoAiFill(form).fill("x");

    expect(model.value.title).toBe("About us");
  });
});

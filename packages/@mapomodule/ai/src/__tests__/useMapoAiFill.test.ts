import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, ref } from "vue";
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

const REFUSED = {
  task: "fill",
  status: "refused",
  refusal: "No.",
  provider: { id: "mock", model: "mock" },
  prompt: 1,
  usage: { inputTokens: 1, outputTokens: 1 },
};

/** An answer without the shape asked: every field is empty. */
function unreadable(keys: readonly string[]): Record<string, unknown> {
  const empty = keys.map((key) => [key, { status: "empty" }]);
  const answer = answered(Object.fromEntries(empty));
  const result = { readable: false, fields: Object.fromEntries(empty) };
  return { ...answer, result: { ...result, warnings: [] } };
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

  it("never writes a verified value over one the form holds, and says which it would replace", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value.title).toBe("Home");
    expect(form.annotations.value.title?.description).toBe(
      'mapo.ai.fill.proposesInsteadOf {"value":"About us","current":"Home"} mapo.ai.fill.proven {"quote":"Quote of About us"}',
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
    serve(REFUSED);
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

describe("useMapoAiFill — a value the record already holds", () => {
  it("leaves a value the field already holds as it is: no write, no mark, nothing to undo", async () => {
    serve(
      answered({
        title: filled("About us"),
        excerpt: filled("Ours", false),
        subtitle: filled("Chi siamo"),
      }),
    );
    const model = {
      title: "About us",
      excerpt: "Ours",
      translations: { it: { subtitle: "Chi siamo" } },
    };
    const form = target(structuredClone(model));
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(
      ai.fields.value.map((field) => [field.key, field.action, field.replaces]),
    ).toEqual([
      ["title", "unchanged", false],
      ["excerpt", "unchanged", false],
      ["subtitle", "unchanged", false],
    ]);
    expect(form.annotations.value).toEqual({});
    ai.apply("title");
    ai.undo();
    expect(form.model.value).toEqual(model);
  });

  it("compares every language a synci18n value goes to", async () => {
    const fields: AnyFieldDescriptor[] = [
      { key: "slug", type: "text", label: "Slug", synci18n: true },
    ];
    const formWith = (
      translations: Record<string, Record<string, string>>,
    ) => ({
      ...target({ translations }),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
      languages: computed(() => ["en", "it"]),
    });
    serve(answered({ slug: filled("about-us") }));
    const everywhere = useMapoAiFill(
      formWith({ en: { slug: "about-us" }, it: { slug: "about-us" } }),
    );
    const inOne = formWith({ en: { slug: "about-us" }, it: {} });
    const once = useMapoAiFill(inOne);

    await everywhere.fill("x");
    await once.fill("x");

    expect(everywhere.fields.value[0]?.action).toBe("unchanged");
    // The write would fill the Italian slug: it waits, as a replacement
    // the field shows nothing of in this language.
    expect(once.fields.value[0]).toMatchObject({
      action: "confirm",
      replaces: true,
    });
    expect(inOne.annotations.value.slug?.description).toContain(
      'mapo.ai.fill.proposesInstead {"value":"about-us"}',
    );
  });

  it("says what a synci18n value would replace in every language", async () => {
    serve(answered({ slug: filled("about-us") }));
    const fields: AnyFieldDescriptor[] = [
      {
        key: "slug",
        type: "text",
        label: "Slug",
        translatable: true,
        synci18n: true,
      },
    ];
    const form = {
      ...target({
        translations: {
          it: { slug: "chi-siamo" },
          en: { slug: "who-we-are" },
          // The AI's own value, and no value: nothing of theirs is lost.
          fr: { slug: "about-us" },
          de: { slug: "" },
        },
      }),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
      languages: computed(() => ["en", "it", "fr", "de"]),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(ai.replaced("translations.it.slug")).toEqual({
      value: "chi-siamo",
      languages: { en: "who-we-are" },
    });
    expect(form.annotations.value["translations.it.slug"]?.description).toBe(
      'mapo.ai.fill.proposesInsteadOf {"value":"about-us","current":"chi-siamo · en: who-we-are"} mapo.ai.fill.proven {"quote":"Quote of about-us"}',
    );
    expect(ai.replaced("nowhere")).toBeUndefined();
  });

  it("never compares a field whose type converts its value as it stores it", async () => {
    serve(answered({ tags: filled(["a", "b"]) }));
    const fields: AnyFieldDescriptor[] = [
      {
        key: "tags",
        type: "text",
        label: "Tags",
        accessor: {
          set: ({ val }) => (Array.isArray(val) ? val.join(",") : val),
        },
      },
    ];
    const form = {
      ...target({ tags: ["a", "b"] }),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(ai.fields.value[0]).toMatchObject({
      action: "confirm",
      replaces: true,
    });
  });

  it("keeps a value the AI wrote in the session to review, when a later answer gives it again", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(answered({ title: filled("Ten years") }));
    await ai.fill("a file");
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));

    await ai.fill("another file");

    expect(form.model.value.title).toBe("About us");
    expect(ai.fields.value[0]).toMatchObject({
      action: "confirm",
      replaces: true,
      undoable: true,
      round: 3,
    });
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.confirm");
  });

  it("counts a value the operator kept, then given again after another, as theirs", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    ai.keep("title");
    post.mockResolvedValueOnce(answered({ title: filled("Ten years") }));
    await ai.fill("a file");
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));

    await ai.fill("another file");

    expect(ai.fields.value[0]).toMatchObject({ action: "unchanged", round: 3 });
    expect(form.annotations.value.title).toBeUndefined();
  });

  it("takes the same value again as news once the field no longer holds it", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target({ title: "About us" });
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    expect(ai.fields.value[0]?.action).toBe("unchanged");
    form.model.value.title = "";
    await nextTick();
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));

    await ai.fill("the same text");

    // Verified, and the field is empty now: it goes in by itself.
    expect(form.model.value.title).toBe("About us");
    expect(ai.fields.value[0]).toMatchObject({
      action: "apply",
      applied: true,
      round: 2,
    });
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.applied");
  });

  it("follows no change of a field that already held the value, and ignores nothing there", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "About us" });
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    form.model.value.title = "Ours";
    await nextTick();
    ai.dismiss();

    expect(ai.fields.value[0]).toMatchObject({ action: "unchanged" });
    expect(ai.fields.value[0]?.review).toBeUndefined();
    expect(form.annotations.value).toEqual({});
  });
});

describe("useMapoAiFill — the items of a list", () => {
  const SPEAKERS: AnyFieldDescriptor[] = [
    {
      key: "speakers",
      type: "repeater",
      label: "Speakers",
      fields: [
        { key: "name", type: "text", label: "Name" },
        { key: "role", type: "text", label: "Role" },
      ],
    },
  ];
  /** A speaker as the answer gives it: its name, proved or not. */
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
  /** A list of speakers, as `run` answers it. */
  const speakers = (...items: Array<[string, boolean]>) => ({
    status: "filled",
    value: items.map(([name]) => ({ name })),
    verified: items.every(([, verified]) => verified),
    quotes: [],
    items: items.map(([name, verified]) => speaker(name, verified)),
  });
  /** A form with the speakers list, holding `model`. */
  const formOf = (model: Record<string, unknown>) => ({
    ...target(model),
    fields: computed(() => SPEAKERS),
    sidebarFields: computed((): AnyFieldDescriptor[] => []),
  });
  const OWN = { name: "Luca", photo: 7 };

  it("adds the items after the field's own, never one it holds, and Restore takes them back", async () => {
    serve(
      answered({
        speakers: speakers(["Anna", true], ["Luca", true], ["Marco", false]),
      }),
    );
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    // Verified items, but the field holds one: the list waits, and replaces nothing.
    expect(ai.fields.value[0]).toMatchObject({
      action: "confirm",
      replaces: false,
    });

    ai.apply("speakers");

    expect(form.model.value.speakers).toEqual([
      OWN,
      { name: "Anna" },
      { name: "Marco" },
    ]);
    // The mark counts what the AI added, and is orange: one is to check.
    expect(form.annotations.value.speakers).toMatchObject({
      color: "warning",
      description: 'mapo.ai.fill.itemsAdded {"n":2,"verified":1}',
    });
    ai.restore("speakers");
    expect(form.model.value.speakers).toEqual([OWN]);
    expect(ai.fields.value[0]).toMatchObject({ applied: false });
  });

  it("adds only the items chosen, and nothing when every chosen one is held", async () => {
    serve(
      answered({
        speakers: speakers(["Anna", true], ["Luca", true], ["Marco", false]),
      }),
    );
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    ai.apply("speakers", { items: [1] });
    expect(form.model.value.speakers).toEqual([OWN]);
    expect(ai.fields.value[0]?.applied).toBe(false);

    ai.apply("speakers", { items: [2] });
    expect(form.model.value.speakers).toEqual([OWN, { name: "Marco" }]);
    // The list's proposal is used: what was not chosen goes with it.
    expect(ai.fields.value[0]).toMatchObject({ applied: true });
    expect(form.annotations.value.speakers?.label).toBe("mapo.ai.fill.applied");
  });

  it("proves a list's write by the quote of the items it added, when every one is verified", async () => {
    serve(answered({ speakers: speakers(["Anna", true], ["Marco", false]) }));
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    ai.apply("speakers", { items: [0] });

    // The list is not verified, but what it added is.
    expect(form.annotations.value.speakers).toMatchObject({
      color: "success",
      description:
        'mapo.ai.fill.itemsAdded {"n":1,"verified":1} mapo.ai.fill.proven {"quote":"Anna"}',
    });
  });

  it("takes a list's added items back from a draft: its mark counts them, and Restore leaves the field's own", async () => {
    serve(
      answered({
        speakers: speakers(["Anna", true], ["Luca", true], ["Marco", false]),
      }),
    );
    const before = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    ai.apply("speakers", { items: [0] });
    const kept = JSON.parse(JSON.stringify(ai.snapshot()));

    // The page loads again, and the draft puts its values back first.
    const after = formOf(JSON.parse(JSON.stringify(before.model.value)));
    const again = useMapoAiFill(after);
    expect(again.resume(kept)).toBe(true);
    await nextTick();

    expect(after.annotations.value.speakers).toMatchObject({
      label: "mapo.ai.fill.applied",
      color: "success",
      description:
        'mapo.ai.fill.itemsAdded {"n":1,"verified":1} mapo.ai.fill.proven {"quote":"Anna"}',
    });
    again.restore("speakers");
    expect(after.model.value.speakers).toEqual([OWN]);
    // The proposal is back, with what the field holds already.
    expect(after.annotations.value.speakers?.description).toBe(
      'mapo.ai.fill.proposesItems {"n":3,"verified":2} mapo.ai.fill.itemsHeld {"n":1}',
    );
  });

  it("adds a verified list after the items an earlier write's onChange put in its field", async () => {
    serve(
      answered({
        title: filled("About us"),
        speakers: speakers(["Anna", true], ["Marco", true]),
      }),
    );
    const fields: AnyFieldDescriptor[] = [
      {
        key: "title",
        type: "text",
        label: "Title",
        // The app seeds the list once the record has a title.
        onChange: ({ model }) => {
          model.speakers = [OWN];
        },
      },
      ...SPEAKERS,
    ];
    const form = {
      ...target(),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value.speakers).toEqual([
      OWN,
      { name: "Anna" },
      { name: "Marco" },
    ]);
    ai.restore("speakers");
    expect(form.model.value.speakers).toEqual([OWN]);
  });

  it("adds an item the AI gives twice once", async () => {
    serve(
      answered({
        speakers: speakers(["Anna", false], ["Anna", false], ["Marco", false]),
      }),
    );
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    ai.apply("speakers");

    expect(form.model.value.speakers).toEqual([
      OWN,
      { name: "Anna" },
      { name: "Marco" },
    ]);
  });

  it("counts on the mark every item the session's answers added to a list, not the last write's only", async () => {
    const post = serve(answered({ speakers: speakers(["Anna", true]) }));
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    ai.apply("speakers");
    post.mockResolvedValueOnce(
      answered({ speakers: speakers(["Anna", true], ["Marco", true]) }),
    );
    await ai.fill("y");

    ai.apply("speakers");

    expect(form.model.value.speakers).toEqual([
      OWN,
      { name: "Anna" },
      { name: "Marco" },
    ]);
    expect(form.annotations.value.speakers?.description).toBe(
      'mapo.ai.fill.itemsAdded {"n":2,"verified":2} mapo.ai.fill.proven {"quote":"Anna"}',
    );
    ai.restore("speakers");
    expect(form.model.value.speakers).toEqual([OWN]);
  });

  it("does not ask to choose the items of a list that holds them all", async () => {
    const post = serve(answered({ speakers: speakers(["Anna", true]) }));
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    ai.apply("speakers");
    // A later answer gives the list again, as the field holds it now: the
    // AI wrote in the field, so the list waits, with nothing to add.
    post.mockResolvedValueOnce(
      answered({ speakers: speakers(["Luca", true], ["Anna", true]) }),
    );
    await ai.fill("y");

    expect(form.annotations.value.speakers?.description).toBe(
      'mapo.ai.fill.proposesItems {"n":2,"verified":2} mapo.ai.fill.itemsHeld {"n":2}',
    );
  });

  it("names no count on the mark of a list a draft took back without what it held before", async () => {
    serve(answered({ speakers: speakers(["Luca", true], ["Anna", true]) }));
    // A date in the field's own item: the draft cannot keep what it held.
    const before = formOf({ speakers: [{ ...OWN, met: new Date(0) }] });
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    ai.apply("speakers");
    const kept = JSON.parse(JSON.stringify(ai.snapshot()));

    const after = formOf(JSON.parse(JSON.stringify(before.model.value)));
    const again = useMapoAiFill(after);
    expect(again.resume(kept)).toBe(true);
    await nextTick();

    // Which items the AI added is not known: the mark says the list's proof.
    expect(after.annotations.value.speakers).toMatchObject({
      label: "mapo.ai.fill.applied",
      description: 'mapo.ai.fill.proven {"quote":"Luca"}',
    });
  });

  it("counts a list whose every item the field holds as already there", async () => {
    serve(answered({ speakers: speakers(["Luca", true]) }));
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(ai.fields.value[0]).toMatchObject({ action: "unchanged" });
    expect(form.annotations.value.speakers).toBeUndefined();
  });

  it("marks a waiting list with its items, and applies from there the verified ones it does not hold", async () => {
    serve(
      answered({
        speakers: speakers(["Anna", true], ["Luca", true], ["Marco", false]),
      }),
    );
    const form = formOf({ speakers: [OWN] });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    const mark = form.annotations.value.speakers;
    expect(mark?.description).toBe(
      'mapo.ai.fill.proposesItems {"n":3,"verified":2} mapo.ai.fill.itemsHeld {"n":1}',
    );
    expect(mark?.actions?.map((action) => action.label)).toEqual([
      "mapo.apply",
      "mapo.ai.fill.ignore",
    ]);

    mark?.actions?.[0]?.onClick();

    expect(form.model.value.speakers).toEqual([OWN, { name: "Anna" }]);
  });

  it("leaves Apply off the mark of a list with no verified item to add, and says to choose them", async () => {
    serve(answered({ speakers: speakers(["Anna", false], ["Marco", false]) }));
    const form = formOf({});
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    const mark = form.annotations.value.speakers;

    expect(mark?.description).toBe(
      'mapo.ai.fill.proposesItems {"n":2,"verified":0} mapo.ai.fill.chooseItems',
    );
    expect(mark?.actions?.map((action) => action.label)).toEqual([
      "mapo.ai.fill.ignore",
    ]);
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
    // Undo all ends the session.
    expect(ai.fields.value).toEqual([]);
  });

  it("restores the operator's own value when the AI's went in over it after a restore", async () => {
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

describe("useMapoAiFill — the session across answers", () => {
  it("keeps the marks and the memory of an earlier answer where a new one gives nothing new", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(
      answered({ excerpt: filled("Ours"), title: { status: "empty" } }),
    );

    await ai.fill("a file");

    expect(form.model.value).toEqual({ title: "About us", excerpt: "Ours" });
    expect(Object.keys(form.annotations.value).sort()).toEqual([
      "excerpt",
      "title",
    ]);
    expect(
      ai.fields.value.map((field) => [field.path, field.round, field.applied]),
    ).toEqual([
      ["title", 1, true],
      ["excerpt", 2, true],
    ]);
    expect(ai.rounds.value).toBe(2);
  });

  it("undoes every answer of the session, newest first, then ends it", async () => {
    const post = serve(answered({ excerpt: filled("Ours") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));
    await ai.fill("a file");
    ai.apply("title");
    expect(form.model.value).toEqual({ title: "About us", excerpt: "Ours" });

    ai.undo();

    expect(form.model.value).toEqual({ title: "Home" });
    expect(form.annotations.value).toEqual({});
    expect(ai.fields.value).toEqual([]);
    expect(ai.rounds.value).toBe(0);
  });

  it("lets Keep make a value the operator's: its mark goes, and undo leaves it", async () => {
    serve(
      answered({ title: filled("About us"), excerpt: filled("Ours", true) }),
    );
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    form.annotations.value.title?.actions?.[0]?.onClick();
    ai.undo();

    expect(form.model.value).toEqual({ title: "About us" });
  });

  it("gives a field the operator changes to the operator: its mark goes, and undo leaves it", async () => {
    serve(answered({ title: filled("About us"), excerpt: filled("Ours") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    form.model.value.title = "About us, Milan";
    await nextTick();

    expect(form.annotations.value.title).toBeUndefined();
    expect(ai.fields.value[0]).toMatchObject({
      path: "title",
      review: "edited",
    });
    ai.restore("title");
    ai.undo();
    expect(form.model.value).toEqual({ title: "About us, Milan" });
  });

  it("drops the proposal of a field that waits once the operator writes in it, so Apply never writes over it", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: "Home" });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.confirm");

    form.model.value.title = "Homepage";
    await nextTick();
    ai.apply("title");

    expect(form.annotations.value.title).toBeUndefined();
    expect(form.model.value.title).toBe("Homepage");
  });

  it("ignores a value that waits when its mark is dismissed: it waits no more", async () => {
    serve(answered({ title: filled("About us", false) }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    ai.dismiss("title");
    ai.apply("title");

    expect(form.model.value).toEqual({});
    expect(ai.fields.value[0]?.review).toBe("ignored");
  });

  it("marks no field for a value with no quote at all, until the operator applies it", async () => {
    const unproven: AiFieldOutcome = {
      status: "filled",
      value: "In review",
      verified: false,
      quotes: [],
    };
    serve(answered({ title: unproven, excerpt: filled("Ours", false) }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    // A quote given and not found still marks its field.
    expect(Object.keys(form.annotations.value)).toEqual(["excerpt"]);

    ai.apply("title");

    expect(form.model.value.title).toBe("In review");
    expect(form.annotations.value.title).toMatchObject({
      label: "mapo.ai.fill.applied",
      color: "warning",
    });
  });

  it("writes a verified value into an empty field the answer's own writes reveal, and no hidden one", async () => {
    serve(
      answered({
        status: filled("published"),
        published_at: filled("2026-11-04"),
        notes: filled("Read twice"),
      }),
    );
    const fields: AnyFieldDescriptor[] = [
      { key: "status", type: "text", label: "Status" },
      {
        key: "published_at",
        type: "date",
        label: "Published at",
        show: ({ model }) => model.status === "published",
      },
      {
        key: "notes",
        type: "text",
        label: "Notes",
        show: ({ model }) => model.status === "archived",
      },
    ];
    const form = {
      ...target(),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value).toEqual({
      status: "published",
      published_at: "2026-11-04",
    });
    expect(ai.fields.value.find((one) => one.key === "notes")).toMatchObject({
      action: "confirm",
      applied: false,
      shown: false,
    });
  });

  it("ends the session when the record is saved: the marks and the memory go, the values stay", async () => {
    serve(answered({ title: filled("About us") }));
    const handlers: Array<(record: Record<string, unknown>) => void> = [];
    const form = {
      ...target(),
      onSaved: (handler: (record: Record<string, unknown>) => void) => {
        handlers.push(handler);
        return () => undefined;
      },
    };
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    for (const handler of handlers) handler(form.model.value);
    ai.undo();

    expect(form.model.value).toEqual({ title: "About us" });
    expect(form.annotations.value).toEqual({});
    expect(ai.fields.value).toEqual([]);
  });

  it("gives no field a new round when the next answer finds nothing new", async () => {
    const first = answered({
      title: filled("About us"),
      excerpt: filled("Ours", false),
      status: { status: "empty" },
    });
    const post = serve(first);
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(first);

    await ai.fill("the same text");

    expect(ai.rounds.value).toBe(2);
    expect(ai.fields.value.map((field) => [field.path, field.round])).toEqual([
      ["title", 1],
      ["excerpt", 1],
      ["status", 1],
    ]);
    expect(form.model.value).toEqual({ title: "About us" });
    const marks = Object.entries(form.annotations.value).map(([path, mark]) => [
      path,
      mark.label,
    ]);
    expect(marks.sort()).toEqual([
      ["excerpt", "mapo.ai.fill.confirm"],
      ["title", "mapo.ai.fill.applied"],
    ]);
  });

  it("takes the proof of a later answer that gives the same value, and never loses one", async () => {
    const post = serve(answered({ title: filled("About us", false) }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    ai.apply("title");
    expect(form.annotations.value.title?.color).toBe("warning");
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));

    await ai.fill("a file");

    expect(form.annotations.value.title?.color).toBe("success");
    expect(ai.fields.value[0]).toMatchObject({ applied: true, round: 1 });
    post.mockResolvedValueOnce(answered({ title: filled("About us", false) }));
    await ai.fill("another file");
    expect(form.annotations.value.title?.color).toBe("success");
  });

  it("never writes again by itself a value the operator restored, when the next answer gives it again", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    ai.restore("title");
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));

    await ai.fill("the same text");

    expect(form.model.value).toEqual({});
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.confirm");
  });

  it("proposes nothing over a value the operator kept, unless a later answer gives another", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    ai.keep("title");
    post.mockResolvedValueOnce(answered({ title: filled("About us") }));

    await ai.fill("the same text");

    expect(form.annotations.value.title).toBeUndefined();
    expect(ai.fields.value[0]).toMatchObject({ review: "kept", round: 1 });
    post.mockResolvedValueOnce(answered({ title: filled("Ten years") }));
    await ai.fill("a file");
    expect(form.annotations.value.title?.description).toContain(
      "mapo.ai.fill.proposesInstead",
    );
  });

  it("keeps the session as it was after a refusal, or an answer it cannot read", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(REFUSED);
    await ai.fill("a file");
    expect(ai.response.value?.status).toBe("refused");
    post.mockResolvedValueOnce(unreadable(["title", "excerpt"]));

    await ai.fill("another file");

    expect(ai.rounds.value).toBe(1);
    expect(ai.fields.value.map((field) => field.path)).toEqual(["title"]);
    ai.undo();
    expect(form.model.value).toEqual({});
  });

  it("restores a field the AI wrote twice to what it held before the AI", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(answered({ title: filled("Ten years") }));
    await ai.fill("a file");
    ai.apply("title");
    expect(form.model.value).toEqual({ title: "Ten years" });

    ai.restore("title");

    expect(form.model.value).toEqual({});
    expect(ai.fields.value[0]).toMatchObject({
      applied: false,
      undoable: false,
    });
    expect(form.annotations.value.title?.label).toBe("mapo.ai.fill.confirm");
  });

  it("offers Restore on a value that waits over the AI's earlier one", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("a text");
    post.mockResolvedValueOnce(answered({ title: filled("Ten years") }));
    await ai.fill("a file");

    const mark = form.annotations.value.title;
    expect(mark?.label).toBe("mapo.ai.fill.confirm");
    expect(mark?.actions?.map((action) => action.label)).toEqual([
      "mapo.apply",
      "mapo.restore",
      "mapo.ai.fill.ignore",
    ]);
    mark?.actions?.[1]?.onClick();

    expect(form.model.value).toEqual({});
    expect(ai.fields.value[0]).toMatchObject({ undoable: false });
  });

  it("keeps waiting a field another field's onChange writes into: no change of the operator's", async () => {
    serve(
      answered({ title: filled("About us"), slug: filled("about", false) }),
    );
    const fields: AnyFieldDescriptor[] = [
      {
        key: "title",
        type: "text",
        label: "Title",
        onChange: ({ model, val }) => {
          model.slug = String(val).toLowerCase().replace(/\s+/g, "-");
        },
      },
      { key: "slug", type: "text", label: "Slug" },
    ];
    const form = {
      ...target(),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");
    await nextTick();

    expect(form.model.value).toEqual({ title: "About us", slug: "about-us" });
    const slug = ai.fields.value.find((one) => one.key === "slug");
    expect(slug).toMatchObject({ applied: false, replaces: true });
    expect(slug?.review).toBeUndefined();
    expect(form.annotations.value.slug?.label).toBe("mapo.ai.fill.confirm");
    ai.apply("slug");
    expect(form.model.value.slug).toBe("about");
    ai.restore("slug");
    expect(form.model.value.slug).toBe("about-us");
  });

  it("tells no change of a value whose data it cannot read, as a BigInt an accessor makes", async () => {
    serve(answered({ views: filled("12") }));
    const fields: AnyFieldDescriptor[] = [
      {
        key: "views",
        type: "text",
        label: "Views",
        accessor: { set: ({ val }) => BigInt(String(val)) },
      },
    ];
    const form = {
      ...target(),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");
    await nextTick();

    expect(form.model.value.views).toBe(BigInt(12));
    expect(ai.fields.value[0]).toMatchObject({ applied: true });
    expect(ai.fields.value[0]?.review).toBeUndefined();
    expect(form.annotations.value.views?.label).toBe("mapo.ai.fill.applied");
  });

  it("writes nothing while the record loads", async () => {
    serve(answered({ title: filled("About us") }));
    const form = { ...target(), isLoading: ref(true) };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value).toEqual({});
    expect(ai.fields.value[0]).toMatchObject({ applied: false });
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
  it("applies a waiting value only while the form shows its field, as it is now", async () => {
    serve(answered({ notes: filled("Long notes", false) }));
    const fields: AnyFieldDescriptor[] = [
      { key: "kind", type: "text", label: "Kind" },
      {
        key: "notes",
        type: "text",
        label: "Notes",
        show: ({ model }) => model.kind === "long",
      },
    ];
    const form = {
      ...target({ kind: "long" }),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
    };
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    expect(ai.isShown("notes")).toBe(true);

    // The operator changes what shows the field, after the answer came.
    form.model.value.kind = "short";
    ai.apply("notes");

    expect(ai.isShown("notes")).toBe(false);
    expect(form.model.value.notes).toBeUndefined();
    form.model.value.kind = "long";
    ai.apply("notes");
    expect(form.model.value.notes).toBe("Long notes");
  });

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

  it("leaves waiting a synci18n field that holds a value in another language: the write would replace it", async () => {
    serve(answered({ slug: filled("about-us") }));
    const fields: AnyFieldDescriptor[] = [
      { key: "slug", type: "text", label: "Slug", synci18n: true },
    ];
    const form = {
      ...target({ translations: { en: {}, it: { slug: "chi-siamo" } } }),
      fields: computed(() => fields),
      sidebarFields: computed((): AnyFieldDescriptor[] => []),
      languages: computed(() => ["en", "it"]),
    };
    const ai = useMapoAiFill(form);

    await ai.fill("x");

    expect(form.model.value).toEqual({
      translations: { en: {}, it: { slug: "chi-siamo" } },
    });
    expect(ai.fields.value[0]).toMatchObject({
      key: "slug",
      action: "confirm",
      replaces: true,
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

    const ai = useMapoAiFill(form);
    await ai.fill("x");
    await nextTick();

    expect(form.model.value).toEqual({ tags: "a,b" });
    // The value converted is the one written: no change of the operator's.
    expect(ai.fields.value[0]?.review).toBeUndefined();
    expect(form.annotations.value.tags?.label).toBe("mapo.ai.fill.applied");
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
      description:
        'mapo.ai.fill.itemsAdded {"n":1,"verified":1} mapo.ai.fill.proven {"quote":"Quote of Ada"}',
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

describe("useMapoAiFill — the session in a draft", () => {
  /** What a draft keeps, as `localStorage` stores it. */
  const stored = (data: unknown) => JSON.parse(JSON.stringify(data));

  it("keeps the values, their quotes, what undoes them and who answered, never the source or the instructions", async () => {
    serve(
      answered({ title: filled("About us"), excerpt: filled("Ours", false) }),
    );
    const form = target({ excerpt: "Old" });
    const ai = useMapoAiFill(form);
    await ai.fill("Title: About us. A line no field quotes.", {
      instructions: "Only the title.",
    });

    const kept = stored(ai.snapshot());

    const text = JSON.stringify(kept);
    expect(text).not.toContain("A line no field quotes");
    expect(text).not.toContain("Only the title");
    expect(kept).toMatchObject({
      format: 1,
      rounds: 1,
      answers: [
        { round: 1, provider: { id: "mock", model: "mock" }, prompt: 1 },
      ],
    });
    const byPath = Object.fromEntries(
      kept.fields.map((field: { path: string }) => [field.path, field]),
    );
    expect(byPath.title).toMatchObject({
      action: "apply",
      applied: true,
      undoable: true,
      round: 1,
      outcome: { quotes: [{ quote: "Quote of About us" }] },
      writes: [
        { order: 1, records: [{ path: "title", written: '"About us"' }] },
      ],
    });
    expect(byPath.excerpt).toMatchObject({
      action: "confirm",
      applied: false,
      undoable: false,
      // What the field held, at its path and at each it is written to.
      held: '["Old","Old"]',
      writes: [],
    });
  });

  it("takes the session back on the form a draft restored: marks, answers and Undo all", async () => {
    serve(
      answered({ title: filled("About us"), excerpt: filled("Ours", false) }),
    );
    const before = target({ excerpt: "Old" });
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    const kept = stored(ai.snapshot());

    // The page loads again, and the draft puts its values back first.
    const after = target();
    Object.assign(after.model.value, stored(before.model.value));
    const again = useMapoAiFill(after);
    expect(again.resume(kept)).toBe(true);
    await nextTick();

    expect(again.fields.value).toEqual(ai.fields.value);
    expect(again.rounds.value).toBe(1);
    expect(again.answers.value).toEqual(ai.answers.value);
    expect(after.annotations.value.title?.label).toBe("mapo.ai.fill.applied");
    expect(after.annotations.value.excerpt?.description).toBe(
      before.annotations.value.excerpt?.description,
    );

    again.undo();
    expect(after.model.value).toEqual({ excerpt: "Old" });
    expect(after.annotations.value).toEqual({});
  });

  it("takes back a value the field already held as such: no mark, nothing to undo", async () => {
    serve(
      answered({ title: filled("About us"), excerpt: filled("Ours", false) }),
    );
    const before = target({ title: "About us" });
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    const kept = stored(ai.snapshot());
    expect(
      kept.fields.find((field: { key: string }) => field.key === "title"),
    ).toMatchObject({ action: "unchanged", replaces: false, applied: false });

    const after = target();
    Object.assign(after.model.value, stored(before.model.value));
    const again = useMapoAiFill(after);
    expect(again.resume(kept)).toBe(true);
    await nextTick();

    expect(again.fields.value).toEqual(ai.fields.value);
    expect(after.annotations.value.title).toBeUndefined();
    again.undo();
    expect(after.model.value).toEqual({ title: "About us" });
  });

  it("gives the operator a value the restored form no longer holds as written", async () => {
    serve(answered({ title: filled("About us"), excerpt: filled("Ours") }));
    const before = target();
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    const kept = stored(ai.snapshot());

    const after = target({ title: "About us, Milan", excerpt: "Ours" });
    const again = useMapoAiFill(after);
    again.resume(kept);
    await nextTick();

    expect(
      again.fields.value.find((one) => one.path === "title"),
    ).toMatchObject({ review: "edited", undoable: false });
    again.undo();
    expect(after.model.value).toEqual({ title: "About us, Milan" });
  });

  it("leaves out a field the form no longer has, and never undoes a write outside a field's own paths", async () => {
    serve(answered({ title: filled("About us"), excerpt: filled("Ours") }));
    const before = target();
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    const kept = stored(ai.snapshot());
    const title = kept.fields.find(
      (one: { path: string }) => one.path === "title",
    );
    title.writes[0].records[0].path = "status";
    kept.fields.push({ ...title, key: "gone", path: "gone" });

    const after = target({
      title: "About us",
      excerpt: "Ours",
      status: "live",
    });
    const again = useMapoAiFill(after);
    again.resume(kept);
    await nextTick();

    expect(again.fields.value.map((one) => one.path).sort()).toEqual([
      "excerpt",
      "title",
    ]);
    expect(
      again.fields.value.find((one) => one.path === "title")?.undoable,
    ).toBe(false);
    again.undo();
    expect(after.model.value).toEqual({ title: "About us", status: "live" });
  });

  it("reads only a session of its own format, and ends the one under way for anything else", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target();
    const ai = useMapoAiFill(form);
    await ai.fill("x");

    expect(ai.resume({ format: 2, rounds: 1, fields: [] })).toBe(false);

    expect(ai.fields.value).toEqual([]);
    expect(form.annotations.value).toEqual({});
    expect(form.model.value).toEqual({ title: "About us" });
    expect(ai.snapshot()).toBeUndefined();
    expect(ai.resume(undefined)).toBe(false);
  });

  it("takes a new answer as the next round of a session taken back", async () => {
    const post = serve(answered({ title: filled("About us") }));
    const before = target();
    const ai = useMapoAiFill(before);
    await ai.fill("x");
    const kept = stored(ai.snapshot());
    const after = target({ title: "About us" });
    const again = useMapoAiFill(after);
    again.resume(kept);
    post.mockResolvedValueOnce(answered({ excerpt: filled("Ours") }));

    await again.fill("y");

    expect(again.rounds.value).toBe(2);
    expect(again.answers.value.map((one) => one.round)).toEqual([1, 2]);
    expect(
      again.fields.value.map((one) => [one.path, one.round, one.undoable]),
    ).toEqual([
      ["title", 1, true],
      ["excerpt", 2, true],
    ]);
    again.undo();
    expect(after.model.value).toEqual({});
  });

  it("keeps no write whose earlier value JSON cannot carry back as it was", async () => {
    serve(answered({ title: filled("About us") }));
    const form = target({ title: new Date(0) });
    const ai = useMapoAiFill(form);
    await ai.fill("x");
    ai.apply("title");
    expect(form.model.value.title).toBe("About us");

    const kept = stored(ai.snapshot());

    expect(kept.fields[0]).toMatchObject({ undoable: false, writes: [] });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { createApp, createRouter, toWebHandler } from "h3";
import { createStorage } from "unstorage";
import type { Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { metadataToJsonSchema } from "@mapomodule/utils";
import type {
  AnyFieldDescriptor,
  FieldAnnotations,
} from "@mapomodule/form/types";
import { useMapoAiFill } from "../runtime/composables/useMapoAiFill";
import { readModelValue, runMapoAiFill } from "../runtime/shared/fill";
import type { MapoAiFillDependencies } from "../runtime/shared/fill";
import { MAPO_AI_GATEWAY_PATH } from "../runtime/shared/gateway";

/**
 * The browser's half of `run` against the gateway's: the request
 * `runMapoAiFill()` builds goes through the real route, the mock and the
 * sanitizer, and its answer is read and planned as a page would.
 */

const SECRET = "fill-gateway-test-secret-0123456789-abcdef";

const USERS: Record<string, Record<string, unknown>> = {
  editor: {
    id: 2,
    username: "editor",
    is_superuser: false,
    all_permissions: ["view_article", "add_article", "change_article"],
  },
  writer: {
    id: 3,
    username: "writer",
    is_superuser: false,
    all_permissions: ["view_article", "change_article"],
  },
};

/** What the mocked `useNuxtApp()` returns: the browser's `$mapoFetch`. */
const nuxt = vi.hoisted(() => {
  const state: { app: Record<string, unknown> } = { app: {} };
  return state;
});

vi.mock("nuxt/app", () => ({ useNuxtApp: () => nuxt.app }));

const runtime = vi.hoisted(() => {
  const state: { config: Record<string, unknown>; root: Storage | undefined } =
    { config: {}, root: undefined };
  return state;
});

vi.mock("nitropack/runtime", async () => {
  const { prefixStorage } = await import("unstorage");
  const root = (): Storage => {
    if (!runtime.root) throw new Error("No root storage in this test");
    return runtime.root;
  };
  return {
    useRuntimeConfig: () => runtime.config,
    useStorage: (base = "") => (base ? prefixStorage(root(), base) : root()),
    useNitroApp: () => ({
      localFetch: (_url: string, init?: RequestInit) => {
        const cookie = new Headers(init?.headers).get("cookie") ?? "";
        const session = /sessionid=([^;]+)/.exec(cookie)?.[1];
        const user = session ? USERS[session] : undefined;
        return user
          ? Response.json(user)
          : Response.json({ detail: "Not signed in" }, { status: 403 });
      },
      hooks: { callHook: async () => {} },
    }),
  };
});

/** `post` of the browser, served by the run route as Nitro mounts it. */
async function postAs(
  session: string,
): Promise<MapoAiFillDependencies["post"]> {
  const run = (await import("../runtime/server/routes/run.post")).default;
  const router = createRouter().post(`${MAPO_AI_GATEWAY_PATH}/run`, run);
  const handle = toWebHandler(createApp().use(router));
  return async (path, body, { signal }) => {
    const response = await handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `sessionid=${session}`,
        },
        body: JSON.stringify(body),
        signal,
      }),
    );
    if (!response.ok) {
      throw Object.assign(new Error(`run answered ${response.status}`), {
        statusCode: response.status,
      });
    }
    return response.json();
  };
}

/** An article, as a detail page describes it. */
const FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title" },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
  { key: "reading_time", type: "number", label: "Reading time" },
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
  },
];

/** The same article as the backend's OPTIONS describes it, with its limits. */
const METADATA = {
  actions: {
    POST: {
      title: { type: "string", label: "Title", max_length: 20 },
      excerpt: { type: "string", label: "Excerpt", max_length: 500 },
      reading_time: {
        type: "integer",
        label: "Reading time",
        min_value: 1,
        max_value: 120,
      },
    },
  },
};

beforeEach(() => {
  vi.resetModules();
  const root = createStorage();
  root.mount("mapo-ai", memoryDriver());
  runtime.root = root;
  runtime.config = {
    app: { baseURL: "/" },
    public: { mapoCore: { userInfoApi: "/api/profiles/me/" } },
    mapoAi: {
      secret: SECRET,
      admin: {},
      providers: { mock: { timeout: 5 } },
    },
  };
});

describe("runMapoAiFill through the gateway", () => {
  it("fills a record from both its descriptions, the stricter limit winning", async () => {
    const model: Record<string, unknown> = { status: "draft" };
    const source = [
      "Title: About us",
      "Excerpt: Who we are, and what we do.",
      "Reading time: 300",
    ].join("\n");

    const answer = await runMapoAiFill(
      {
        fields: FIELDS,
        schema: metadataToJsonSchema(METADATA),
        source,
        entity: { label: "Article", model: "article" },
        form: {
          pathOf: (key) => key,
          read: (path) => readModelValue(model, path),
        },
      },
      { post: await postAs("editor") },
    );

    expect(answer.response).toMatchObject({
      task: "fill",
      status: "answered",
      provider: { id: "mock", model: "mock" },
    });
    expect(
      answer.entries.map((entry) => [entry.key, entry.action, entry.replaces]),
    ).toEqual([
      ["title", "apply", false],
      ["excerpt", "apply", false],
      ["reading_time", "discard", false],
      ["status", "empty", false],
    ]);
    expect(answer.entries[2]?.outcome).toMatchObject({
      status: "discarded",
      reason: "too-high",
    });
  });

  it("asks add_ for a new record and change_ for one that exists", async () => {
    const input = {
      fields: FIELDS,
      source: "Title: About us",
      entity: { model: "article" },
      form: { pathOf: (key: string) => key, read: () => undefined },
    };
    const post = await postAs("writer");

    const existing = await runMapoAiFill(
      { ...input, existing: true },
      { post },
    );
    const created = runMapoAiFill({ ...input, existing: false }, { post });

    expect(existing.response.status).toBe("answered");
    await expect(created).rejects.toMatchObject({ statusCode: 403 });
  });

  it("reads a refusal of the model", async () => {
    const answer = await runMapoAiFill(
      {
        fields: FIELDS,
        source: "Title: About us #mock:refusal",
        form: { pathOf: (key) => key, read: () => undefined },
      },
      { post: await postAs("editor") },
    );

    expect(answer.response).toMatchObject({ status: "refused" });
    expect(answer.entries).toEqual([]);
  });

  it("fills a translatable field and a part of an object, through the composable", async () => {
    const post = await postAs("editor");
    nuxt.app = {
      $mapoFetch: (
        path: string,
        options: { body: unknown; signal?: AbortSignal },
      ) => post(path, options.body, { signal: options.signal }),
    };
    const model = ref<Record<string, unknown>>({});
    const annotations = ref<FieldAnnotations>({});
    const fields = computed((): AnyFieldDescriptor[] => [
      { key: "subtitle", type: "text", label: "Subtitle", translatable: true },
      { key: "seo", type: "seo", label: "SEO" },
    ]);
    const ai = useMapoAiFill(
      { model, fields, annotations, currentLang: ref("it"), isNew: ref(true) },
      { entity: { model: "article" } },
    );

    await ai.fill(
      ["Subtitle: La nostra storia", "seo_title: Chi siamo, la storia"].join(
        "\n",
      ),
    );

    expect(ai.error.value).toBeUndefined();
    expect(model.value).toEqual({
      translations: { it: { subtitle: "La nostra storia" } },
      seo: { title: "Chi siamo, la storia" },
    });
    expect(Object.keys(annotations.value).sort()).toEqual([
      "seo",
      "translations.it.subtitle",
    ]);
  });
});

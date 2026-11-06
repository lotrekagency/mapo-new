import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, createRouter, toWebHandler } from "h3";
import type { MapoAiReadContext } from "../runtime/server/readers/types";
import type {
  MapoAiReadFile,
  MapoAiReader,
} from "../runtime/server/readers/types";
import { MAPO_AI_GATEWAY_PATH } from "../runtime/shared/gateway";
import type { MapoAiReadResponse } from "../runtime/shared/gateway";
import { workbook } from "./workbooks";

const readPath = `${MAPO_AI_GATEWAY_PATH}/read`;

/** The users of the fake backend, by the value of their session cookie. */
const USERS: Record<string, Record<string, unknown>> = {
  admin: { id: 1, username: "admin", is_superuser: true, groups: ["admin"] },
  editor: { id: 2, username: "editor", is_superuser: false, groups: [] },
};

type Hook = (...args: unknown[]) => unknown;

/** What the mocked `nitropack/runtime` serves: the config, the hooks, the backend. */
const runtime = vi.hoisted(() => {
  const state: {
    config: Record<string, unknown>;
    hooks: Map<string, Hook[]>;
  } = { config: {}, hooks: new Map() };
  return state;
});

vi.mock("nitropack/runtime", () => ({
  useRuntimeConfig: () => runtime.config,
  useStorage: () => {
    throw new Error("read keeps nothing");
  },
  useNitroApp: () => ({
    localFetch: (_url: string, init?: RequestInit) => fakeBackend(init),
    hooks: {
      callHook: async (name: string, ...args: unknown[]) => {
        for (const hook of runtime.hooks.get(name) ?? []) await hook(...args);
      },
    },
  }),
}));

/** The backend's `userInfoApi`: the user of the session cookie, or 403 as DRF answers. */
function fakeBackend(init?: RequestInit): Response {
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  const session = /(?:^|;\s*)sessionid=([^;]+)/.exec(cookie)?.[1];
  const user = session ? USERS[session] : undefined;
  return user
    ? Response.json(user)
    : Response.json({ detail: "Not signed in" }, { status: 403 });
}

function onHook(name: string, hook: Hook): void {
  runtime.hooks.set(name, [...(runtime.hooks.get(name) ?? []), hook]);
}

/** The read route on a bare h3 app, as Nitro mounts it. Fresh modules each time. */
async function gateway(): Promise<(request: Request) => Promise<Response>> {
  const read = (await import("../runtime/server/routes/read.post")).default;
  const router = createRouter().post(readPath, read);
  return toWebHandler(createApp().use(router));
}

async function registry() {
  return import("../runtime/server/readers/registry");
}

function formWith(...files: File[]): FormData {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  return form;
}

function readRequest(
  body: FormData | string,
  session = "editor",
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${readPath}`, {
    method: "POST",
    headers: { cookie: `sessionid=${session}`, ...headers },
    body,
  });
}

async function readFile(
  file: File,
  session = "editor",
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await (
    await gateway()
  )(readRequest(formWith(file), session));
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

let warnings: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  runtime.config = {
    app: { baseURL: "/" },
    public: { mapoCore: { userInfoApi: "/api/profiles/me/" } },
    mapoAi: { admin: {} },
  };
  runtime.hooks = new Map();
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /_mapo/ai/read — who may call it, and what it takes", () => {
  it("answers 401 without a session, and reads nothing", async () => {
    const response = await (
      await gateway()
    )(
      new Request(`http://localhost${readPath}`, {
        method: "POST",
        body: formWith(new File(["Ciao"], "a.txt")),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("refuses a file another site sends with the user's session", async () => {
    const response = await (
      await gateway()
    )(
      readRequest(formWith(new File(["Ciao"], "a.txt")), "editor", {
        "sec-fetch-site": "cross-site",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("answers 415 to a body that is no form", async () => {
    const response = await (
      await gateway()
    )(
      readRequest('{"text": "Ciao"}', "editor", {
        "content-type": "application/json",
      }),
    );

    expect(response.status).toBe(415);
  });

  it("answers 400 to a form with no file, or more than one", async () => {
    const empty = new FormData();
    empty.append("file", "just text");
    const handle = await gateway();

    const none = await handle(readRequest(empty));
    const two = await handle(
      readRequest(formWith(new File(["a"], "a.txt"), new File(["b"], "b.txt"))),
    );

    expect(none.status).toBe(400);
    expect(two.status).toBe(400);
  });

  it("answers 413 to a file larger than maxFileBytes, and to any file when it is 0", async () => {
    runtime.config.mapoAi = { admin: {}, limits: { maxFileBytes: 10 } };
    const large = await readFile(new File(["01234567890"], "a.txt"));
    runtime.config.mapoAi = { admin: {}, limits: { maxFileBytes: 0 } };
    const none = await readFile(new File(["0"], "a.txt"));

    expect(large.status).toBe(413);
    expect(none.status).toBe(413);
    expect(none.body).toMatchObject({
      statusMessage: "This app takes no files",
    });
  });

  it("answers 413 to a form larger than the file's bound and a form's 16 KB", async () => {
    runtime.config.mapoAi = { admin: {}, limits: { maxFileBytes: 100 } };
    const large = "x".repeat(64 * 1024);

    const { status } = await readFile(new File([large], "a.txt"));

    expect(status).toBe(413);
  });
});

describe("POST /_mapo/ai/read — what it answers", () => {
  it("reads a file into the parts of a source, named after the file, and keeps nothing of it", async () => {
    const { status, body, headers } = await readFile(
      new File(["Nome;Città\nRossi;Milano\n"], "persone ottobre.csv", {
        type: "text/csv",
      }),
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      status: "read",
      reader: "csv",
      parts: [
        {
          kind: "text",
          text: "| Nome | Città |\n| --- | --- |\n| Rossi | Milano |",
          name: "persone ottobre.csv",
        },
      ],
    });
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("reads a workbook, by its extension whatever type the browser declares", async () => {
    const bytes = workbook({ Listino: [["Prodotto"], ["Sedia"]] });

    const { body } = await readFile(
      new File([new Uint8Array(bytes)], "listino.xlsx", {
        type: "application/octet-stream",
      }),
    );

    expect(body).toEqual({
      status: "read",
      reader: "xlsx",
      parts: [
        {
          kind: "text",
          text: "## Listino\n\n| Prodotto |\n| --- |\n| Sedia |",
          name: "listino.xlsx",
        },
      ],
    });
  });

  it("takes a CSV Excel declares as its own type, by its extension", async () => {
    const { body } = await readFile(
      new File(["a;b\n1;2"], "dati.csv", { type: "application/vnd.ms-excel" }),
    );

    expect(body).toMatchObject({ status: "read", reader: "csv" });
  });

  it("says that no reader takes a format, without an error", async () => {
    const { status, body } = await readFile(
      new File(["%PDF-1.7"], "brochure.pdf", { type: "application/pdf" }),
    );

    expect(status).toBe(200);
    expect(body).toEqual({ status: "unsupported" });
  });

  it("says a file whose format is off is unsupported, even when its type names a format that is on", async () => {
    runtime.config.mapoAi = { admin: {}, readers: { csv: false } };

    const { body } = await readFile(
      new File(["a;b\n1;2"], "dati.csv", { type: "text/plain" }),
    );

    expect(body).toEqual({ status: "unsupported" });
  });

  it("says a format mapo.ai.readers turns off is unsupported, as the environment can", async () => {
    runtime.config.mapoAi = { admin: {}, readers: { csv: false } };

    const { body } = await readFile(new File(["a;b\n1;2"], "a.csv"));

    expect(body).toEqual({ status: "unsupported" });
  });

  it("says a file with no text is empty", async () => {
    const { body } = await readFile(new File(["  \n "], "vuoto.txt"));

    expect(body).toEqual({ status: "empty", reader: "text" });
  });

  it("says a file whose text run would not take whole is too long", async () => {
    runtime.config.mapoAi = { admin: {}, limits: { maxSourceChars: 5 } };

    const { body } = await readFile(new File(["Chi siamo"], "a.txt"));

    expect(body).toEqual({ status: "too-long", reader: "text", chars: 9 });
  });

  it("says a file its reader cannot read failed, and logs why without its name", async () => {
    const { body } = await readFile(new File(['{"a": '], "segreto-rossi.json"));

    expect(body).toEqual({ status: "failed", reader: "json" });
    expect(warnings).toHaveBeenCalledTimes(1);
    const logged = String(warnings.mock.calls[0]?.[0]);
    expect(logged).toContain(
      'The reader "json" could not read a file of 6 bytes',
    );
    expect(logged).not.toContain("segreto-rossi");
  });

  it("keeps the name of a file in any script, and only its last segment", async () => {
    const { body } = await readFile(
      new File(["Ciao"], "C:\\fakepath\\perché\u0007 caffè.txt"),
    );

    expect(body).toMatchObject({
      parts: [{ name: "perché caffè.txt" }],
    });
  });
});

describe("the app's readers and hooks", () => {
  it("reads a format of the app's with the app's reader", async () => {
    const { registerMapoAiReader } = await registry();
    registerMapoAiReader({
      id: "ics",
      label: "Calendar event",
      extensions: ["ics"],
      types: ["text/calendar"],
      read: (file) => [
        {
          kind: "text",
          text: `Event: ${new TextDecoder().decode(file.bytes)}`,
          name: file.name,
        },
      ],
    });

    const { body } = await readFile(new File(["Lancio"], "invito.ics"));

    expect(body).toEqual({
      status: "read",
      reader: "ics",
      parts: [{ kind: "text", text: "Event: Lancio", name: "invito.ics" }],
    });
  });

  it("reads one of Mapo's formats with the app's reader that takes its place", async () => {
    const { registerMapoAiReader } = await registry();
    registerMapoAiReader({
      id: "csv",
      extensions: ["csv"],
      read: () => [{ kind: "text", text: "the app's CSV" }],
    });

    const { body } = await readFile(new File(["a;b"], "a.csv"));

    expect(body).toEqual({
      status: "read",
      reader: "csv",
      parts: [{ kind: "text", text: "the app's CSV" }],
    });
  });

  it("turns off an app's reader with mapo.ai.readers, as Mapo's", async () => {
    runtime.config.mapoAi = { admin: {}, readers: { ics: false } };
    const { registerMapoAiReader } = await registry();
    registerMapoAiReader({
      id: "ics",
      extensions: ["ics"],
      read: () => [{ kind: "text", text: "event" }],
    });

    const { body } = await readFile(new File(["x"], "a.ics"));

    expect(body).toEqual({ status: "unsupported" });
  });

  it("gives the hooks what any reader read, with the file and the user, and answers what they leave", async () => {
    const seen: MapoAiReadContext[] = [];
    onHook("mapo-ai:read", (context) => {
      const read = context as MapoAiReadContext;
      seen.push(read);
      read.parts = read.parts.map((part) => ({
        ...part,
        text: part.text.replace(/\S+@\S+/g, "[email]"),
      }));
    });
    onHook("mapo-ai:read", (context) => {
      const read = context as MapoAiReadContext;
      read.parts.push({ kind: "text", text: "Added by the app", name: "app" });
    });

    const { body } = await readFile(
      new File(["Scrivi a mario@acme.it"], "a.txt", { type: "text/plain" }),
      "admin",
    );

    expect(body).toEqual({
      status: "read",
      reader: "text",
      parts: [
        { kind: "text", text: "Scrivi a [email]", name: "a.txt" },
        { kind: "text", text: "Added by the app", name: "app" },
      ],
    });
    expect(seen[0]).toMatchObject({
      user: { id: "1", username: "admin" },
      admin: true,
      reader: "text",
      file: { name: "a.txt", type: "text/plain", size: 22 },
    });
    expect(Object.isFrozen(seen[0]?.file)).toBe(true);
  });

  it("says a file is empty when the hooks leave no text, and failed when one throws", async () => {
    onHook("mapo-ai:read", (context) => {
      const read = context as MapoAiReadContext;
      if (read.file.name === "boom.txt") throw new Error("refused");
      read.parts = [];
    });

    const emptied = await readFile(new File(["Ciao"], "a.txt"));
    const thrown = await readFile(new File(["Ciao"], "boom.txt"));

    expect(emptied.body).toEqual({ status: "empty", reader: "text" });
    expect(thrown.body).toEqual({ status: "failed", reader: "text" });
    expect(String(warnings.mock.calls.at(-1)?.[0])).toContain(
      "A mapo-ai:read hook failed",
    );
  });

  it("measures the text the hooks leave against what run takes", async () => {
    runtime.config.mapoAi = { admin: {}, limits: { maxSourceChars: 10 } };
    onHook("mapo-ai:read", (context) => {
      const read = context as MapoAiReadContext;
      read.parts = [{ kind: "text", text: "much more than ten characters" }];
    });

    const { body } = await readFile(new File(["short"], "a.txt"));

    expect(body).toEqual({ status: "too-long", reader: "text", chars: 29 });
  });
});

describe("readSourceFile, the operation", () => {
  const file: MapoAiReadFile = {
    name: "a.txt",
    type: "text/plain",
    bytes: new TextEncoder().encode("Ciao"),
  };

  async function readWith(
    reader: MapoAiReader,
    touchUp: (facts: { parts: unknown }) => unknown = (facts) => facts.parts,
  ): Promise<MapoAiReadResponse> {
    const { readSourceFile } = await import("../runtime/server/readers/read");
    return readSourceFile(file, {
      readers: [reader],
      isOn: () => true,
      maxChars: 1000,
      touchUp: async (facts) => touchUp(facts),
    });
  }

  function readerOf(read: MapoAiReader["read"]): MapoAiReader {
    return { id: "acme", extensions: ["txt"], read };
  }

  it("reads what a reader gives as outside data: text parts, trimmed, a name cut to 200 characters", async () => {
    const response = await readWith(
      readerOf(() =>
        JSON.parse(
          JSON.stringify([
            { kind: "text", text: "  uno  ", name: "x".repeat(300) },
            { kind: "text", text: "   " },
            { kind: "image", url: "https://acme.it/a.png" },
            "due",
          ]),
        ),
      ),
    );

    expect(response).toEqual({
      status: "read",
      reader: "acme",
      parts: [{ kind: "text", text: "uno", name: "x".repeat(200) }],
    });
    expect(String(warnings.mock.calls[0]?.[0])).toContain(
      'The reader "acme" gave 2 entries that are no text part',
    );
  });

  it("says a reader that gives no list, or throws, failed", async () => {
    const noList = await readWith(readerOf(() => JSON.parse('"text"')));
    const thrown = await readWith(
      readerOf(() => {
        throw new Error("locked");
      }),
    );

    expect(noList).toEqual({ status: "failed", reader: "acme" });
    expect(thrown).toEqual({ status: "failed", reader: "acme" });
  });

  it("says a file with more parts than run takes failed", async () => {
    const many = Array.from({ length: 21 }, (_, at) => ({
      kind: "text" as const,
      text: `part ${at}`,
    }));

    const response = await readWith(readerOf(() => many));

    expect(response).toEqual({ status: "failed", reader: "acme" });
    expect(String(warnings.mock.calls[0]?.[0])).toContain(
      "more than the 20 run takes",
    );
  });

  it("gives the hooks copies, so they never change what the reader returned", async () => {
    const given = [{ kind: "text" as const, text: "Ciao" }];
    const reader = readerOf(() => given);

    await readWith(reader, (facts) => {
      const parts = facts.parts as { text: string }[];
      return parts.map((part) => ({ ...part, text: "changed" }));
    });

    expect(given).toEqual([{ kind: "text", text: "Ciao" }]);
  });
});

describe("registerMapoAiReader", () => {
  it("puts the app's readers first, a reader with Mapo's id in place of Mapo's", async () => {
    const { mapoAiReaders, registerMapoAiReader } = await registry();
    registerMapoAiReader({ id: "ics", extensions: ["ics"], read: () => [] });
    registerMapoAiReader({ id: "html", extensions: ["html"], read: () => [] });

    const ids = mapoAiReaders().map((reader) => reader.id);

    expect(ids).toEqual([
      "ics",
      "html",
      "text",
      "markdown",
      "json",
      "csv",
      "xlsx",
    ]);
  });

  it("finds a file's reader by its extension first, then by its media type", async () => {
    const { mapoAiReaders, readerOf } = await registry();
    const readers = mapoAiReaders();
    const of = (name: string, type = "") =>
      readerOf(readers, { name, type })?.id;

    expect(of("NOTE.TXT")).toBe("text");
    expect(of("dati.csv", "application/vnd.ms-excel")).toBe("csv");
    expect(of("pagina", "text/html; charset=utf-8")).toBe("html");
    expect(of("vecchio.xls", "application/vnd.ms-excel")).toBeUndefined();
    expect(of("senza-nome")).toBeUndefined();
  });

  it("reads a file by the first reader of its extension that is on, and never by its type when they are all off", async () => {
    const { mapoAiReaders, readerOf, registerMapoAiReader } = await registry();
    registerMapoAiReader({ id: "my-csv", extensions: ["csv"], read: () => [] });
    const readers = mapoAiReaders();
    const of = (off: string[], name: string, type = "") =>
      readerOf(readers, { name, type }, (id) => !off.includes(id))?.id;

    expect(of([], "a.csv")).toBe("my-csv");
    expect(of(["my-csv"], "a.csv", "text/plain")).toBe("csv");
    expect(of(["my-csv", "csv"], "a.csv", "text/plain")).toBeUndefined();
    expect(of(["html"], "pagina", "text/html")).toBeUndefined();
  });

  it("refuses what is no reader", async () => {
    const { registerMapoAiReader } = await registry();
    const read = () => [];
    const invalid: unknown[] = [
      { id: "Bad Id", extensions: ["x"], read },
      { id: "nothing", extensions: ["x"] },
      { id: "nowhere", extensions: [], read },
      { id: "dots", extensions: ["tar.gz"], read },
      { id: "types", types: ["not a type"], read },
      { id: "list", extensions: "csv", read },
    ];

    for (const reader of invalid) {
      expect(() => registerMapoAiReader(reader as MapoAiReader)).toThrow(
        TypeError,
      );
    }
    registerMapoAiReader({ id: "twice", extensions: ["x"], read });
    expect(() =>
      registerMapoAiReader({ id: "twice", extensions: ["y"], read }),
    ).toThrow("registered already");
  });
});

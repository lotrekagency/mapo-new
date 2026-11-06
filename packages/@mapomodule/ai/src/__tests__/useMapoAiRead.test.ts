import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapoAiRead } from "../runtime/composables/useMapoAiRead";
import {
  MapoAiReadAnswerError,
  readMapoAiFile,
  readMapoAiReadResponse,
} from "../runtime/shared/read";

/** What the mocked `useNuxtApp()` returns: the `$mapoFetch` of the test. */
const nuxt = vi.hoisted(() => {
  const state: { app: Record<string, unknown> } = { app: {} };
  return state;
});

vi.mock("nuxt/app", () => ({ useNuxtApp: () => nuxt.app }));

beforeEach(() => {
  nuxt.app = {};
});

describe("readMapoAiReadResponse", () => {
  it("reads every answer of read", () => {
    const answers: unknown[] = [
      { status: "unsupported" },
      { status: "empty", reader: "text" },
      { status: "failed", reader: "json" },
      { status: "too-long", reader: "csv", chars: 120_000 },
      {
        status: "read",
        reader: "html",
        parts: [{ kind: "text", text: "# Chi siamo", name: "chi-siamo.html" }],
      },
    ];

    expect(answers.map(readMapoAiReadResponse)).toEqual(answers);
  });

  it("reads what is no answer as none, and leaves out a part that is no text", () => {
    const answers: unknown[] = [
      null,
      { status: "read", reader: "text", parts: [] },
      { status: "read", parts: [{ kind: "text", text: "a" }] },
      { status: "too-long", reader: "csv", chars: -1 },
      { status: "empty" },
      { status: "done", reader: "text" },
    ];

    expect(answers.map(readMapoAiReadResponse)).toEqual(
      answers.map(() => undefined),
    );
    expect(
      readMapoAiReadResponse({
        status: "read",
        reader: "text",
        parts: [{ kind: "image" }, { kind: "text", text: "a", name: 3 }],
      }),
    ).toEqual({
      status: "read",
      reader: "text",
      parts: [{ kind: "text", text: "a" }],
    });
  });
});

describe("readMapoAiFile", () => {
  it("sends the file as the field file of a form to read, and reads the answer", async () => {
    const post = vi.fn(
      async (_path: string, _body: FormData, _options: object) => ({
        status: "read",
        reader: "text",
        parts: [{ kind: "text", text: "Ciao", name: "a.txt" }],
      }),
    );
    const controller = new AbortController();

    const response = await readMapoAiFile(
      new File(["Ciao"], "a.txt", { type: "text/plain" }),
      { post },
      { signal: controller.signal },
    );

    expect(response).toEqual({
      status: "read",
      reader: "text",
      parts: [{ kind: "text", text: "Ciao", name: "a.txt" }],
    });
    const [path, body, options] = post.mock.calls[0] ?? [];
    expect(path).toBe("/_mapo/ai/read");
    expect(options).toEqual({ signal: controller.signal });
    const sent = body instanceof FormData ? body.get("file") : undefined;
    expect(sent).toBeInstanceOf(File);
    expect(sent instanceof File ? sent.name : "").toBe("a.txt");
  });

  it("names a Blob as the caller says, and refuses an answer it cannot read", async () => {
    const post = vi.fn(async (_path: string, body: FormData) => {
      const sent = body.get("file");
      return {
        status: "read",
        reader: "text",
        name: sent instanceof File ? sent.name : "",
      };
    });

    await expect(
      readMapoAiFile(new Blob(["Ciao"]), { post }, { name: "incollato.txt" }),
    ).rejects.toBeInstanceOf(MapoAiReadAnswerError);
    const sent = post.mock.calls[0]?.[1].get("file");
    expect(sent instanceof File ? sent.name : "").toBe("incollato.txt");
  });
});

describe("useMapoAiRead", () => {
  it("reads a file through the app's $mapoFetch", async () => {
    const mapoFetch = vi.fn(async () => ({ status: "unsupported" }));
    nuxt.app = { $mapoFetch: mapoFetch };

    const response = await useMapoAiRead().read(new File(["%PDF"], "a.pdf"));

    expect(response).toEqual({ status: "unsupported" });
    expect(mapoFetch).toHaveBeenCalledWith("/_mapo/ai/read", {
      method: "POST",
      body: expect.any(FormData),
      signal: undefined,
    });
  });

  it("passes on the error of the call", async () => {
    nuxt.app = {
      $mapoFetch: async () => {
        throw Object.assign(new Error("Payload Too Large"), {
          statusCode: 413,
        });
      },
    };

    await expect(
      useMapoAiRead().read(new File(["x"], "a.txt")),
    ).rejects.toMatchObject({ statusCode: 413 });
  });
});

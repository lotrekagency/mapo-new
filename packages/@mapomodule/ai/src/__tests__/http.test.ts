import { describe, expect, it } from "vitest";
import {
  callServer,
  errorMessage,
  maskKeys,
  providerServer,
  readEvents,
  readJsonLines,
  retryAfterOf,
  serverJson,
  statusFailure,
} from "../runtime/server/providers/http";
import { MapoAiProviderError } from "../runtime/server/providers/types";
import { fakeServer, json, refusedConnection, streamed } from "./servers";

const signal = new AbortController().signal;
const options = { signal, name: "The server" };

async function failureOf(
  promise: Promise<unknown>,
): Promise<MapoAiProviderError> {
  const error: unknown = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof MapoAiProviderError)) {
    throw new Error(`Not a provider's failure: ${String(error)}`);
  }
  return error;
}

describe("callServer", () => {
  it("posts JSON with the server's headers, and gets without a body", async () => {
    const { fetch, calls } = fakeServer({
      "/api/chat": [json({})],
      "/api/tags": [json({})],
    });
    const server = providerServer("Ollama", {
      baseURL: "http://h:1",
      apiKey: "k",
      fetch,
    });

    await callServer(server, "/api/chat", { body: { a: 1 }, signal });
    await callServer(server, "/api/tags", { signal });

    // The call never follows a redirect, and gives up with the signal it is given.
    expect(calls).toEqual([
      {
        path: "/api/chat",
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer k",
        },
        body: { a: 1 },
        redirect: "manual",
        signal,
      },
      {
        path: "/api/tags",
        method: "GET",
        headers: { authorization: "Bearer k" },
        body: undefined,
        redirect: "manual",
        signal,
      },
    ]);
    expect(server.name).toBe("Ollama at http://h:1");
  });

  it("tells a server that cannot be reached from one that took too long", async () => {
    const slow = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Headers Timeout Error"), {
        code: "UND_ERR_HEADERS_TIMEOUT",
      }),
    });
    const { fetch } = fakeServer({ "/a": [refusedConnection(), slow] });
    const server = providerServer("Ollama", { baseURL: "http://h:1", fetch });

    const refused = await failureOf(callServer(server, "/a", { signal }));
    const timedOut = await failureOf(callServer(server, "/a", { signal }));

    expect(refused.failure).toBe("unavailable");
    expect(refused.message).toBe(
      "Ollama at http://h:1 cannot be reached (ECONNREFUSED)",
    );
    expect(timedOut.failure).toBe("timeout");
    // Node's fetch stops waiting for a server's first bytes after five
    // minutes, and a streaming server sends them only with its first words.
    expect(timedOut.message).toContain("300 seconds");
  });
});

describe("serverJson, bounds", () => {
  it("refuses a JSON answer past its bound", async () => {
    const { fetch } = fakeServer({
      "/big": [json(`{"models":"${"x".repeat(2_100_000)}"}`)],
    });
    const server = providerServer("X", { baseURL: "http://h:1", fetch });

    const failure = await failureOf(serverJson(server, "/big", { signal }));

    expect(failure.failure).toBe("invalid-response");
  });
});

describe("serverJson", () => {
  it("reads JSON, and fails for an error status or an answer that is not JSON", async () => {
    const { fetch } = fakeServer({
      "/a": [json({ ok: 1 }), json({ error: "nope" }, 404), json("<html>")],
    });
    const server = providerServer("X", { baseURL: "http://h:1", fetch });

    expect(await serverJson(server, "/a", { signal })).toEqual({ ok: 1 });
    const missing = await failureOf(serverJson(server, "/a", { signal }));
    const garbled = await failureOf(serverJson(server, "/a", { signal }));

    expect(missing.failure).toBe("refused-request");
    expect(missing.message).toBe("X at http://h:1 answered 404: nope");
    expect(garbled.failure).toBe("invalid-response");
  });
});

describe("errorMessage", () => {
  it("says what an error answer says, in one line", async () => {
    const cases: Array<[Response, string]> = [
      [json({ error: "model 'x' not found" }, 404), "model 'x' not found"],
      [json({ error: { message: "Invalid\n key" } }, 401), "Invalid key"],
      [json({ message: "Busy" }, 503), "Busy"],
      [json({ detail: "Not found" }, 404), "Not found"],
      [new Response("Bad Gateway", { status: 502 }), "Bad Gateway"],
      [new Response(null, { status: 500 }), ""],
    ];
    for (const [response, said] of cases) {
      expect(await errorMessage(response, signal)).toBe(said);
    }
  });

  it("reads at most a few hundred characters of it", async () => {
    const said = await errorMessage(
      new Response("x".repeat(100_000), { status: 500 }),
      signal,
    );

    expect(said).toHaveLength(200);
  });

  it("keeps out of the log what a JSON error repeats of the request", async () => {
    // A validation error, as FastAPI writes one, quotes the source it refused.
    const said = await errorMessage(
      json(
        {
          detail: [
            { type: "missing", msg: "Field required", input: "SECRET SOURCE" },
          ],
        },
        422,
      ),
      signal,
    );
    const nothing = await errorMessage(
      json({ request: { prompt: "SECRET SOURCE" } }, 400),
      signal,
    );

    expect(said).toBe("Field required");
    expect(nothing).toBe("");
  });
});

describe("statusFailure", () => {
  it("names the failure of each status", () => {
    const cases: Array<[number, string]> = [
      [400, "refused-request"],
      [401, "refused-request"],
      [404, "refused-request"],
      [408, "timeout"],
      [429, "rate-limit"],
      [500, "unavailable"],
      [502, "unavailable"],
      [503, "unavailable"],
      [504, "timeout"],
      [413, "too-long"],
      [307, "refused-request"],
    ];
    for (const [status, failure] of cases) {
      const error = statusFailure(new Response(null, { status }), "said", "S");
      expect(error.failure).toBe(failure);
      expect(error.message).toContain(`S answered ${status}: said`);
    }
    expect(
      statusFailure(new Response(null, { status: 307 }), "", "S").message,
    ).toContain("a redirect, which the provider does not follow");
  });

  it("passes on how long a busy server asks to wait", () => {
    const response = new Response(null, {
      status: 429,
      headers: { "retry-after": "30" },
    });

    expect(statusFailure(response, "", "S").retryAfter).toBe(30);
    expect(
      statusFailure(new Response(null, { status: 429 }), "", "S").retryAfter,
    ).toBeUndefined();
  });
});

describe("retryAfterOf", () => {
  it("reads seconds, or a date, up to an hour", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(retryAfterOf("12", now)).toBe(12);
    expect(retryAfterOf("Thu, 01 Jan 2026 10:00:30 GMT", now)).toBe(30);
    expect(retryAfterOf("Thu, 01 Jan 2026 09:00:00 GMT", now)).toBe(0);
    expect(retryAfterOf("99999", now)).toBe(3600);
    expect(retryAfterOf("soon", now)).toBeUndefined();
    expect(retryAfterOf(null, now)).toBeUndefined();
    expect(retryAfterOf("", now)).toBeUndefined();
  });
});

describe("reading a stream", () => {
  it("reads JSON lines across chunks, a character split in two included", async () => {
    const values: unknown[] = [];
    const text = '{"a":"città"}\n\n{"b":2}\r\n{"c":3}';

    await readJsonLines(
      streamed(text, {}, 1),
      (value) => void values.push(value),
      options,
    );

    expect(values).toEqual([{ a: "città" }, { b: 2 }, { c: 3 }]);
  });

  it("reads a long line sent in many small chunks in linear time", async () => {
    const values: unknown[] = [];
    const long = `{"text":"${"x".repeat(4_000_000)}"}\n{"b":2}\n`;
    const started = performance.now();

    // Servers stream a piece of a token at a time: chunks of a few bytes.
    await readJsonLines(
      streamed(long, {}, 32),
      (value) => void values.push(value),
      options,
    );

    expect(values).toHaveLength(2);
    // Split again at each chunk, the line took minutes; read once, well under a few seconds.
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it("stops when the reader says so, and lets the server go", async () => {
    const values: unknown[] = [];
    let cancelled = false;
    const bytes = new TextEncoder().encode('{"a":1}\n{"b":2}\nnot json\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel() {
        cancelled = true;
      },
    });

    await readJsonLines(
      new Response(body),
      (value) => {
        values.push(value);
        return true;
      },
      options,
    );

    expect(values).toEqual([{ a: 1 }]);
    expect(cancelled).toBe(true);
  });

  it("fails on an error event of the stream, with its message only", async () => {
    const failure = await failureOf(
      readEvents(
        streamed(
          'data: {"a":1}\n\nerror: {"code":500,"message":"the model crashed","prompt":"SECRET"}\n\n',
        ),
        () => undefined,
        options,
      ),
    );

    expect(failure.failure).toBe("unavailable");
    expect(failure.message).toBe(
      "The server failed while answering: the model crashed",
    );
  });

  it("refuses a line that is not JSON", async () => {
    const failure = await failureOf(
      readJsonLines(streamed("{}\nnope\n"), () => undefined, options),
    );

    expect(failure.failure).toBe("invalid-response");
  });

  it("joins the data lines of an event, and stops at [DONE]", async () => {
    const values: unknown[] = [];
    const text =
      'event: message\ndata: {"a":\ndata: 1}\n\n: comment\n\ndata: [DONE]\n\ndata: {"late":true}\n\n';

    await readEvents(
      streamed(text, {}, 3),
      (value) => void values.push(value),
      options,
    );

    expect(values).toEqual([{ a: 1 }]);
  });

  it("stops reading a server that never stops", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1_000_000));
    const endless = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(chunk);
        },
      }),
    );

    const failure = await failureOf(
      readJsonLines(endless, () => undefined, options),
    );

    expect(failure.failure).toBe("invalid-response");
    expect(failure.message).toContain("more than 8000000 bytes");
  });

  it("fails as a timeout when the stream breaks after the call was given up", async () => {
    const controller = new AbortController();
    const broken = new Response(
      new ReadableStream<Uint8Array>({
        pull(stream) {
          controller.abort();
          stream.error(new DOMException("aborted", "AbortError"));
        },
      }),
    );

    const failure = await failureOf(
      readJsonLines(broken, () => undefined, {
        signal: controller.signal,
        name: "S",
      }),
    );

    expect(failure.failure).toBe("timeout");
  });
});

describe("the headers and the keys of a cloud's API", () => {
  it("takes the key in the headers the API asks for, and adds a call's own", async () => {
    const { fetch, calls } = fakeServer({ "/v1/messages": [json({})] });
    const server = providerServer(
      "Anthropic",
      { baseURL: "https://api.test/v1", apiKey: "sk-ant-k", fetch },
      { "x-api-key": "sk-ant-k", "anthropic-version": "2026-10-21" },
    );

    await callServer(server, "/messages", {
      body: {},
      signal,
      headers: { "anthropic-beta": "a-beta", "x-api-key": "not-the-key" },
    });

    expect(calls[0]?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "sk-ant-k",
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "a-beta",
    });
  });

  it("masks what looks like a key in a server's message", async () => {
    expect(
      maskKeys(
        "Incorrect API key provided: sk-proj-********************WXYZ. See the docs.",
      ),
    ).toBe("Incorrect API key provided: [a key]. See the docs.");
    expect(maskKeys("invalid sk-ant-api03-AbCdEf_123-xyz key")).toBe(
      "invalid [a key] key",
    );
    expect(maskKeys("proxy saw Bearer abc.def.ghi and refused")).toBe(
      "proxy saw [a key] and refused",
    );
    expect(maskKeys("a task-list of sk-1 items")).toBe(
      "a task-list of sk-1 items",
    );

    const said = await errorMessage(
      json(
        { error: { message: "Incorrect API key provided: sk-proj-****WXYZ." } },
        401,
      ),
      signal,
    );
    const page = await errorMessage(
      new Response("<h1>401</h1> Bearer sk-live-secret-value rejected", {
        status: 401,
      }),
      signal,
    );

    expect(said).toBe("Incorrect API key provided: [a key].");
    expect(page).not.toContain("secret");
    // A bearer token ends at a quote, which stays.
    expect(maskKeys("rejected 'Bearer abc.def' here")).toBe(
      "rejected '[a key]' here",
    );
  });

  it("masks the server's exact key, whatever it looks like, in an error and in a stream's error line", async () => {
    const server = providerServer("Proxy", {
      baseURL: "https://proxy.test/v1",
      apiKey: "gw_live_51x9",
    });

    const said = await errorMessage(
      json({ error: { message: "token gw_live_51x9 is revoked" } }, 401),
      signal,
      server.mask,
    );
    const failure = await failureOf(
      readEvents(
        streamed('error: {"message":"token gw_live_51x9 is revoked"}\n\n'),
        () => undefined,
        { signal, name: "Proxy", mask: server.mask },
      ),
    );

    expect(said).toBe("token [a key] is revoked");
    expect(failure.message).toContain("token [a key] is revoked");
    expect(failure.message).not.toContain("51x9");
  });
});

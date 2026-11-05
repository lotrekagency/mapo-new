import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "../runtime/server/providers/ollama";
import { MapoAiProviderError } from "../runtime/server/providers/types";
import type { MapoAiProviderFailure } from "../runtime/server/providers/types";
import {
  bodiesOf,
  fakeServer,
  json,
  providerRequest,
  recorded,
  refusedConnection,
  streamed,
} from "./servers";
import type { Served } from "./servers";

/**
 * A new address for each server: the provider keeps what Ollama says about
 * a model for ten minutes, by address.
 */
let servers = 0;
function ollama(answers: Record<string, Served[]>, apiKey?: string) {
  servers += 1;
  const server = fakeServer({ "/api/version": [version()], ...answers });
  const provider = createOllamaProvider({
    baseURL: `http://ollama-${servers}.test:11434`,
    fetch: server.fetch,
    ...(apiKey ? { apiKey } : {}),
  });
  return { provider, ...server };
}

const NDJSON = { headers: { "content-type": "application/x-ndjson" } };

/** The answer Ollama streamed, in chunks of `size` bytes. */
function answered(size = 64): Response {
  return streamed(recorded("ollama-chat-answered.ndjson"), NDJSON, size);
}

/** Ollama's version: the one the provider was verified with, recorded. */
function version(said: unknown = undefined): Response {
  return said === undefined
    ? json(recorded("ollama-version.json"))
    : json({ version: said });
}

/** What `/api/show` says about qwen2.5:7b: a context of 32768 tokens. */
function shown(): Response {
  return json(recorded("ollama-show.json"));
}

/** Ollama's refusal of a prompt for the context, with the counts given. */
function refusedForContext(counted: number, context: number): Response {
  const text = recorded("ollama-chat-too-long.json")
    .replace("(1647 tokens)", `(${counted} tokens)`)
    .replace("(512 tokens)", `(${context} tokens)`);
  return json(text, 400);
}

/** One line of Ollama's stream. */
function line(value: Record<string, unknown>): string {
  return `${JSON.stringify({ model: "qwen2.5:7b", ...value })}\n`;
}

/** An answer to a prompt of `read` tokens, as Ollama streams it. */
function answeredAfter(read: number): Response {
  return streamed(
    line({ message: { content: "{}" }, done: false }) +
      line({
        message: { content: "" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: read,
        eval_count: 1,
      }),
    NDJSON,
  );
}

async function failureOf(promise: Promise<unknown>): Promise<{
  failure: MapoAiProviderFailure;
  message: string;
  retryAfter?: number;
}> {
  const error: unknown = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof MapoAiProviderError)) {
    throw new Error(`Not a provider's failure: ${String(error)}`);
  }
  return {
    failure: error.failure,
    message: error.message,
    ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
  };
}

/** The body of a call to `/api/chat`, in order. */
function chatBody(calls: Parameters<typeof bodiesOf>[0], index = 0): unknown {
  return bodiesOf(calls, "/api/chat")[index];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the ollama provider", () => {
  it("reads Ollama's streamed answer, and its counts", async () => {
    const { provider } = ollama({
      "/api/show": [shown()],
      "/api/chat": [answered(37)],
    });

    const answer = await provider.run(providerRequest());

    expect(answer).toEqual({
      status: "answered",
      output: {
        values: { title: "About us", body: "We are a small studio in Milan." },
        evidence: [
          { field: "title", quote: "Title: About us", where: "" },
          {
            field: "body",
            quote: "Body: We are a small studio in Milan.",
            where: "",
          },
        ],
      },
      usage: { inputTokens: 632, outputTokens: 96 },
    });
  });

  it("asks with the schema in the prompt, and keeps Ollama from cutting it", async () => {
    const { provider, calls } = ollama({
      "/api/show": [shown()],
      "/api/chat": [answered()],
    });
    const request = providerRequest();

    await provider.run(request);

    expect(chatBody(calls)).toEqual({
      model: "qwen2.5:7b",
      stream: true,
      think: false,
      truncate: false,
      shift: false,
      format: request.schema,
      options: { temperature: 0, num_ctx: 8192, num_predict: 4096 },
      messages: [
        {
          role: "system",
          content: `${request.prompt.instructions}\n\n# The answer's JSON schema\n${JSON.stringify(request.schema)}`,
        },
        { role: "user", content: request.prompt.input },
      ],
    });
    expect(bodiesOf(calls, "/api/show")).toEqual([{ model: "qwen2.5:7b" }]);
    expect(calls.every((call) => !("authorization" in call.headers))).toBe(
      true,
    );
  });

  it("sends its key as a bearer token", async () => {
    const { provider, calls } = ollama(
      { "/api/show": [shown()], "/api/chat": [answered()] },
      "k-123",
    );

    await provider.run(providerRequest());

    expect(calls.map((call) => call.headers.authorization)).toEqual([
      "Bearer k-123",
      "Bearer k-123",
      "Bearer k-123",
    ]);
  });

  it("keeps a model's details for ten minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const { provider, paths } = ollama({
      "/api/version": [version(), version()],
      "/api/show": [shown(), shown()],
      "/api/chat": [answered(), answered(), answered()],
    });

    await provider.run(providerRequest());
    vi.setSystemTime(new Date("2026-01-01T10:09:00Z"));
    await provider.run(providerRequest());
    vi.setSystemTime(new Date("2026-01-01T10:11:00Z"));
    await provider.run(providerRequest());

    expect(paths()).toEqual([
      "/api/version",
      "/api/show",
      "/api/chat",
      "/api/chat",
      "/api/version",
      "/api/show",
      "/api/chat",
    ]);
  });

  it("asks a context for the prompt and the answer, a power of two within the model's", async () => {
    const { provider, calls } = ollama({
      "/api/show": [shown()],
      "/api/chat": [answeredAfter(4000), answeredAfter(30_000)],
    });

    // Some 5000 tokens on the high side, and 4096 for the answer.
    await provider.run(providerRequest({ source: "x ".repeat(5000) }));
    // More than the model's 32768: Ollama decides, since it counts.
    await provider.run(providerRequest({ source: "x ".repeat(60_000) }));

    expect(chatBody(calls, 0)).toMatchObject({
      options: { num_ctx: 16_384, num_predict: 4096 },
    });
    expect(chatBody(calls, 1)).toMatchObject({
      options: { num_ctx: 32_768, num_predict: 4096 },
    });
  });

  it("caps the context at the one model_info has, when the architecture is not said", async () => {
    const { provider, calls } = ollama({
      "/api/show": [
        json({ model_info: { "foo.context_length": 9000 }, capabilities: [] }),
      ],
      "/api/chat": [answeredAfter(8000)],
    });

    await provider.run(providerRequest({ source: "x ".repeat(20_000) }));

    expect(chatBody(calls)).toMatchObject({ options: { num_ctx: 9000 } });
  });

  it("asks once more with room for what Ollama counted", async () => {
    const { provider, calls } = ollama({
      "/api/show": [shown()],
      "/api/chat": [refusedForContext(9000, 8192), answered()],
    });

    const answer = await provider.run(providerRequest());

    expect(answer.status).toBe("answered");
    expect(chatBody(calls, 0)).toMatchObject({ options: { num_ctx: 8192 } });
    expect(chatBody(calls, 1)).toMatchObject({
      options: { num_ctx: 16_384, num_predict: 4096 },
    });
  });

  it("fails as too long when the model has no room for what Ollama counted", async () => {
    const { provider, paths } = ollama({
      "/api/show": [shown()],
      "/api/chat": [refusedForContext(32_000, 8192)],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("too-long");
    expect(failure.message).toContain("32000 tokens");
    expect(failure.message).toContain("32768 tokens qwen2.5:7b reads");
    expect(paths().filter((path) => path === "/api/chat")).toHaveLength(1);
  });

  it("fails as too long when Ollama refuses the second call too", async () => {
    const { provider, paths } = ollama({
      "/api/show": [shown()],
      "/api/chat": [
        refusedForContext(9000, 8192),
        refusedForContext(17_000, 16_384),
      ],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("too-long");
    expect(paths().filter((path) => path === "/api/chat")).toHaveLength(2);
  });

  it("fails as too long when Ollama counts fewer tokens than the context it was asked", async () => {
    // The recorded refusal, for a context of 512, given to a call that
    // asked 8192: no larger context would help.
    const { provider } = ollama({
      "/api/show": [shown()],
      "/api/chat": [json(recorded("ollama-chat-too-long.json"), 400)],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("too-long");
  });

  it("fails as truncated when the answer reaches its cap", async () => {
    const { provider } = ollama({
      "/api/show": [shown()],
      "/api/chat": [streamed(recorded("ollama-chat-length.ndjson"), NDJSON)],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("truncated");
    expect(failure.message).toContain("4096 tokens");
  });

  it("refuses a model Ollama does not have, before asking it", async () => {
    const { provider, paths } = ollama({
      "/api/show": [json(recorded("ollama-show-missing.json"), 404)],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "no-such-model:1b" })),
    );

    expect(failure).toMatchObject({ failure: "refused-request" });
    expect(failure.message).toContain(
      "answered 404: model 'no-such-model:1b' not found",
    );
    expect(paths()).toEqual(["/api/version", "/api/show"]);
  });

  it("tells apart a server that cannot be reached, one that failed and one that is busy", async () => {
    const cases: Array<[Served, MapoAiProviderFailure, number?]> = [
      [refusedConnection(), "unavailable"],
      [
        json({ error: "model requires more system memory" }, 500),
        "unavailable",
      ],
      [json({ error: "busy" }, 429, { "retry-after": "12" }), "rate-limit", 12],
      [json(recorded("ollama-chat-missing.json"), 404), "refused-request"],
    ];
    for (const [served, expected, retryAfter] of cases) {
      const { provider } = ollama({
        "/api/show": [shown()],
        "/api/chat": [served],
      });

      const failure = await failureOf(provider.run(providerRequest()));

      expect(failure.failure).toBe(expected);
      expect(failure.retryAfter).toBe(retryAfter);
    }
    const { provider } = ollama({ "/api/show": [refusedConnection()] });
    const failure = await failureOf(provider.run(providerRequest()));
    expect(failure.message).toMatch(/cannot be reached \(ECONNREFUSED\)/);
  });

  it("fails as a timeout when the gateway gave up", async () => {
    const controller = new AbortController();
    controller.abort();
    const { provider } = ollama({ "/api/show": [shown()] });

    const failure = await failureOf(
      provider.run(providerRequest({ signal: controller.signal })),
    );

    expect(failure.failure).toBe("timeout");
  });

  it("fails as unavailable for an error in the stream, or a stream that stops early", async () => {
    const broken = [
      line({ message: { content: "{" }, done: false }) +
        `${JSON.stringify({ error: "model runner has unexpectedly stopped" })}\n`,
      line({ message: { content: "{" }, done: false }),
    ];
    for (const text of broken) {
      const { provider } = ollama({
        "/api/show": [shown()],
        "/api/chat": [streamed(text, NDJSON)],
      });

      const failure = await failureOf(provider.run(providerRequest()));

      expect(failure.failure).toBe("unavailable");
    }
  });

  it("fails as an invalid response for a line that is not JSON", async () => {
    const { provider } = ollama({
      "/api/show": [shown()],
      "/api/chat": [streamed("not json\n", NDJSON)],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("invalid-response");
  });

  it("hands back the text of an answer that is not JSON, and leaves out the reasoning", async () => {
    const { provider } = ollama({
      "/api/show": [shown()],
      "/api/chat": [
        streamed(
          line({
            message: { thinking: "Let me see", content: "" },
            done: false,
          }) +
            line({ message: { content: "Città è" }, done: false }) +
            line({ message: { content: "" }, done: true, done_reason: "stop" }),
          NDJSON,
          1,
        ),
      ],
    });

    const answer = await provider.run(providerRequest());

    expect(answer).toEqual({
      status: "answered",
      output: "Città è",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("calls only an Ollama of the version it was verified with, or later", async () => {
    const accepted = ["0.40.13", "0.40.14", "0.41.0-rc1", "v0.40.13", "1.0.0"];
    const refused: unknown[] = ["0.40.12", "0.30.0", "dev", "", 40];
    for (const said of accepted) {
      const { provider } = ollama({
        "/api/version": [version(said)],
        "/api/show": [shown()],
        "/api/chat": [answered()],
      });
      expect((await provider.run(providerRequest())).status).toBe("answered");
    }
    for (const said of refused) {
      const { provider, paths } = ollama({ "/api/version": [version(said)] });

      const failure = await failureOf(provider.run(providerRequest()));

      expect(failure.failure).toBe("refused-request");
      expect(failure.message).toContain("needs 0.40.13 or later");
      expect(paths()).toEqual(["/api/version"]);
    }
  });

  it("asks an older Ollama again at the next call, so an update counts at once", async () => {
    const { provider, paths } = ollama({
      "/api/version": [version("0.30.0"), version()],
      "/api/show": [shown()],
      "/api/chat": [answered()],
    });

    await failureOf(provider.run(providerRequest()));
    const answer = await provider.run(providerRequest());

    expect(answer.status).toBe("answered");
    expect(paths()).toEqual([
      "/api/version",
      "/api/version",
      "/api/show",
      "/api/chat",
    ]);
  });

  it("fails as too long when Ollama counted the prompt well below its size", async () => {
    // As an Ollama that ignores truncate: false answers a cut prompt.
    const { provider } = ollama({
      "/api/show": [shown()],
      "/api/chat": [
        streamed(
          line({ message: { content: "{}" }, done: false }) +
            line({
              message: { content: "" },
              done: true,
              done_reason: "stop",
              prompt_eval_count: 258,
              eval_count: 1,
            }),
          NDJSON,
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ source: "word ".repeat(12_000) })),
    );

    expect(failure.failure).toBe("too-long");
    expect(failure.message).toContain("read 258 tokens");
  });

  it("lists the models Ollama has, those of the latest tag also without it", async () => {
    const { provider } = ollama({
      "/api/tags": [json(recorded("ollama-tags.json"))],
    });

    const models = await provider.listModels?.(new AbortController().signal);

    expect(models?.map((model) => model.id)).toEqual([
      "qwen3.8:27b",
      "gemma4:12b",
      "qwen2.5:7b",
      "llava:7b",
      "llama3.1:latest",
      "llama3.1",
    ]);
  });
});

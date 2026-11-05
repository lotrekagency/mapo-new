import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleProvider } from "../runtime/server/providers/openaiCompatible";
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
 * A new address for each server: the provider keeps what a server says
 * about its models for ten minutes, by address.
 */
let servers = 0;
function compatible(
  answers: Record<string, Served[]>,
  settings: { apiKey?: string; contextTokens?: number } = {},
) {
  servers += 1;
  const server = fakeServer(answers);
  const provider = createOpenAiCompatibleProvider({
    baseURL: `http://llm-${servers}.test:1234/v1`,
    fetch: server.fetch,
    ...settings,
  });
  return { provider, ...server };
}

const SSE = { headers: { "content-type": "text/event-stream" } };
const CHAT = "/v1/chat/completions";
const MODELS = "/v1/models";

/** The answer the server streamed, in chunks of `size` bytes. */
function answered(size = 64): Response {
  return streamed(recorded("openai-compatible-answered.sse"), SSE, size);
}

/** The server's list: the recorded one, without contexts. */
function listed(): Response {
  return json(recorded("openai-compatible-models.json"));
}

/** A stream of events, each a chunk of an answer. */
function events(...chunks: Array<Record<string, unknown> | string>): Response {
  const text = chunks
    .map((chunk) =>
      typeof chunk === "string" ? chunk : `data: ${JSON.stringify(chunk)}\n\n`,
    )
    .join("");
  return streamed(text, SSE);
}

function delta(value: Record<string, unknown>, finish: string | null = null) {
  return { choices: [{ index: 0, delta: value, finish_reason: finish }] };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** The `max_tokens` of each call to the chat, in order. */
function capsOf(calls: Parameters<typeof bodiesOf>[0]): unknown[] {
  return bodiesOf(calls, CHAT).map((body) =>
    typeof body === "object" && body !== null && "max_tokens" in body
      ? body.max_tokens
      : undefined,
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

describe("the openai-compatible provider", () => {
  it("reads the server's streamed answer, and its counts", async () => {
    const { provider } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [answered(29)],
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

  it("asks with the schema in the prompt and in response_format, and caps the answer", async () => {
    const { provider, calls } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [answered()],
    });
    const request = providerRequest();

    await provider.run(request);

    expect(bodiesOf(calls, CHAT)).toEqual([
      {
        model: "qwen2.5:7b",
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0,
        max_tokens: 4096,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "mapo_ai_answer",
            strict: true,
            schema: request.schema,
          },
        },
        messages: [
          {
            role: "system",
            content: `${request.prompt.instructions}\n\n# The answer's JSON schema\n${JSON.stringify(request.schema)}`,
          },
          { role: "user", content: request.prompt.input },
        ],
      },
    ]);
    expect(calls.every((call) => !("authorization" in call.headers))).toBe(
      true,
    );
  });

  it("sends its key as a bearer token", async () => {
    const { provider, calls } = compatible(
      { [MODELS]: [listed()], [CHAT]: [answered()] },
      { apiKey: "k-123" },
    );

    await provider.run(providerRequest());

    expect(calls.map((call) => call.headers.authorization)).toEqual([
      "Bearer k-123",
      "Bearer k-123",
    ]);
  });

  it("reads the list of models once in ten minutes, and calls even without one", async () => {
    const { provider, paths } = compatible({
      [MODELS]: [json({ error: "no such route" }, 404)],
      [CHAT]: [answered(), answered()],
    });

    await provider.run(providerRequest());
    await provider.run(providerRequest());

    expect(paths()).toEqual([MODELS, CHAT, CHAT]);
  });

  it("refuses before the call a prompt that cannot fit the context the server says", async () => {
    const { provider, paths } = compatible({
      [MODELS]: [json({ data: [{ id: "qwen2.5:7b", max_model_len: 2048 }] })],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ source: "word ".repeat(12_000) })),
    );

    expect(failure.failure).toBe("too-long");
    expect(failure.message).toContain("2048 tokens qwen2.5:7b reads");
    expect(paths()).toEqual([MODELS]);
  });

  it("fails as too long when the server counted the prompt well below its size", async () => {
    const { provider } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [
        events(
          delta({ content: "{}" }),
          delta({}, "stop"),
          { choices: [], usage: { prompt_tokens: 512, completion_tokens: 2 } },
          "data: [DONE]\n\n",
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ source: "word ".repeat(12_000) })),
    );

    expect(failure.failure).toBe("too-long");
    expect(failure.message).toContain("read 512 tokens");
  });

  it("with the context the app says, refuses before the call a prompt that cannot fit", async () => {
    const { provider, paths } = compatible(
      { [MODELS]: [listed()] },
      { contextTokens: 16_384 },
    );

    const failure = await failureOf(
      provider.run(providerRequest({ source: "word ".repeat(19_000) })),
    );

    expect(failure.failure).toBe("too-long");
    expect(failure.message).toContain("16384 tokens qwen2.5:7b reads");
    expect(paths()).toEqual([MODELS]);
  });

  it("with the context the app says, fails after the call when the server counted the prompt up to it", async () => {
    // As Ollama's /v1 answered a prompt of 73,620 tokens, cut to its context.
    const cut = events(
      delta({ content: '{"values":{}}' }, "stop"),
      { choices: [], usage: { prompt_tokens: 16_386, completion_tokens: 91 } },
      "data: [DONE]\n\n",
    );
    const { provider } = compatible(
      { [MODELS]: [listed()], [CHAT]: [cut] },
      { contextTokens: 16_384 },
    );

    const failure = await failureOf(
      provider.run(providerRequest({ source: "word ".repeat(12_000) })),
    );

    expect(failure.failure).toBe("too-long");
    expect(failure.message).toContain("read 16386 tokens of the 16384");
  });

  it("takes the context the server's list says over the app's", async () => {
    const whole = events(
      delta({ content: '{"values":{}}' }, "stop"),
      { choices: [], usage: { prompt_tokens: 16_386, completion_tokens: 91 } },
      "data: [DONE]\n\n",
    );
    const { provider } = compatible(
      {
        [MODELS]: [
          json({ data: [{ id: "qwen2.5:7b", max_model_len: 32_768 }] }),
        ],
        [CHAT]: [whole],
      },
      { contextTokens: 16_384 },
    );

    const answer = await provider.run(
      providerRequest({ source: "word ".repeat(12_000) }),
    );

    expect(answer.status).toBe("answered");
  });

  it("fails as too long when the server refuses the prompt for the context, and no answer has room", async () => {
    const refusals: Served[] = [
      // vLLM, for a prompt that leaves no room for an answer.
      json(
        {
          error: {
            message:
              "This model's maximum context length is 8192 tokens. However, you requested 11596 tokens (7500 in the messages, 4096 in the completion). Please reduce the length of the messages or completion.",
            type: "BadRequestError",
          },
        },
        400,
      ),
      // llama.cpp, which says no count.
      json(
        {
          error: {
            message:
              "the request exceeds the available context size, try increasing it",
            type: "exceed_context_size_error",
          },
        },
        400,
      ),
      // A proxy before the server, for a body too large.
      new Response("<html>413 Request Entity Too Large</html>", {
        status: 413,
      }),
    ];
    for (const refusal of refusals) {
      const { provider, paths } = compatible({
        [MODELS]: [listed()],
        [CHAT]: [refusal],
      });

      const failure = await failureOf(provider.run(providerRequest()));

      expect(failure.failure).toBe("too-long");
      expect(paths().filter((path) => path === CHAT)).toHaveLength(1);
    }
  });

  it("asks once more with the cap that fits, when vLLM says how many tokens the prompt has", async () => {
    const wordings = [
      "This model's maximum context length is 8192 tokens. However, you requested 9096 tokens (5000 in the messages, 4096 in the completion). Please reduce the length of the messages or completion.",
      "'max_tokens' or 'max_completion_tokens' is too large: 4096. This model's maximum context length is 8192 tokens and your request has 5000 input tokens (4096 > 8192 - 5000).",
    ];
    for (const message of wordings) {
      const { provider, calls } = compatible({
        [MODELS]: [listed()],
        [CHAT]: [json({ error: { message } }, 400), answered()],
      });

      const answer = await provider.run(providerRequest());

      expect(answer.status).toBe("answered");
      expect(capsOf(calls)).toEqual([4096, 3192]);
    }
  });

  it("fails as too long when vLLM refuses the second call too", async () => {
    const refusal = () =>
      json(
        {
          error: {
            message:
              "This model's maximum context length is 8192 tokens and your request has 5000 input tokens (4096 > 8192 - 5000).",
          },
        },
        400,
      );
    const { provider, paths } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [refusal(), refusal()],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("too-long");
    expect(paths().filter((path) => path === CHAT)).toHaveLength(2);
  });

  it("with the context the server says, leaves room for the prompt in the cap", async () => {
    const { provider, calls } = compatible({
      [MODELS]: [json({ data: [{ id: "qwen2.5:7b", max_model_len: 4500 }] })],
      [CHAT]: [answered()],
    });
    const request = providerRequest();
    const chars =
      request.prompt.instructions.length +
      "\n\n# The answer's JSON schema\n".length +
      JSON.stringify(request.schema).length +
      request.prompt.input.length;

    await provider.run(request);

    expect(capsOf(calls)).toEqual([4500 - Math.floor(chars / 6)]);
  });

  it("fails as too long, not as a cut answer, when the server cut the prompt to fill the context", async () => {
    // LM Studio cuts the prompt to the context, then the answer runs out of room.
    const { provider } = compatible(
      {
        [MODELS]: [listed()],
        [CHAT]: [
          events(
            delta({ content: '{"values":' }, "length"),
            {
              choices: [],
              usage: { prompt_tokens: 16_380, completion_tokens: 4 },
            },
            "data: [DONE]\n\n",
          ),
        ],
      },
      { contextTokens: 16_384 },
    );

    const failure = await failureOf(
      provider.run(providerRequest({ source: "word ".repeat(12_000) })),
    );

    expect(failure.failure).toBe("too-long");
  });

  it("fails as unavailable for a stream that stops before the end, or an error event of llama.cpp", async () => {
    const broken = [
      // The connection dropped: no reason to stop, no [DONE].
      events(delta({ content: '{"values":{"title":"Ab' })),
      // llama.cpp reports a failure while it answers in an `error:` field.
      streamed(
        `data: ${JSON.stringify(delta({ content: '{"values":' }))}\n\n` +
          'error: {"code":500,"message":"the model crashed","type":"server_error"}\n\n',
        SSE,
      ),
    ];
    const { provider } = compatible({
      [MODELS]: [listed(), listed()],
      [CHAT]: broken,
    });

    const dropped = await failureOf(provider.run(providerRequest()));
    const crashed = await failureOf(provider.run(providerRequest()));

    expect(dropped).toMatchObject({ failure: "unavailable" });
    expect(dropped.message).toContain("stopped before the end of its answer");
    expect(crashed).toMatchObject({ failure: "unavailable" });
    expect(crashed.message).toContain("the model crashed");
  });

  it("says once when a server with a known context answers without the prompt's count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const noCounts = () =>
      events(delta({ content: "{}" }, "stop"), "data: [DONE]\n\n");
    const { provider } = compatible(
      { [MODELS]: [listed()], [CHAT]: [noCounts(), noCounts()] },
      { contextTokens: 16_384 },
    );

    await provider.run(providerRequest());
    await provider.run(providerRequest());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "answered without the counts of the prompt",
    );
  });

  it("does not follow a redirect of the server", async () => {
    const { provider } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [
        new Response(null, {
          status: 307,
          headers: { location: "http://elsewhere.test/v1/chat/completions" },
        }),
      ],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("refused-request");
    expect(failure.message).toContain(
      "a redirect, which the provider does not follow",
    );
  });

  it("fails as truncated when the answer reaches its cap", async () => {
    const { provider } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [streamed(recorded("openai-compatible-length.sse"), SSE)],
    });

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("truncated");
  });

  it("hands back a refusal, and a content filter as one", async () => {
    const { provider } = compatible({
      [MODELS]: [listed(), listed()],
      [CHAT]: [
        events(
          delta({ refusal: "I can't " }),
          delta({ refusal: "help with that." }),
          delta({}, "stop"),
          "data: [DONE]\n\n",
        ),
        events(delta({}, "content_filter"), "data: [DONE]\n\n"),
      ],
    });

    const refused = await provider.run(providerRequest());
    const filtered = await provider.run(providerRequest());

    expect(refused).toMatchObject({
      status: "refused",
      refusal: "I can't help with that.",
    });
    expect(filtered).toMatchObject({ status: "refused" });
  });

  it("tells apart a model it does not have, a server down and a busy one", async () => {
    const cases: Array<[Served, MapoAiProviderFailure, number?]> = [
      [
        json(recorded("openai-compatible-missing.json"), 404),
        "refused-request",
      ],
      [json({ error: { message: "Invalid key" } }, 401), "refused-request"],
      [json({ error: { message: "Overloaded" } }, 503), "unavailable"],
      [json({}, 429, { "retry-after": "7" }), "rate-limit", 7],
      [refusedConnection(), "unavailable"],
    ];
    for (const [served, expected, retryAfter] of cases) {
      const { provider } = compatible({
        [MODELS]: [listed()],
        [CHAT]: [served],
      });

      const failure = await failureOf(provider.run(providerRequest()));

      expect(failure.failure).toBe(expected);
      expect(failure.retryAfter).toBe(retryAfter);
    }
  });

  it("fails as unavailable for an error event, and as an invalid response for no event", async () => {
    const { provider } = compatible({
      [MODELS]: [listed(), listed()],
      [CHAT]: [
        events(delta({ content: "{" }), {
          error: { message: "The model crashed" },
        }),
        streamed("", SSE),
      ],
    });

    const crashed = await failureOf(provider.run(providerRequest()));
    const empty = await failureOf(provider.run(providerRequest()));

    expect(crashed).toMatchObject({ failure: "unavailable" });
    expect(crashed.message).toContain("The model crashed");
    expect(empty.failure).toBe("invalid-response");
  });

  it("masks the server's key in an error it sends in the stream", async () => {
    const { provider } = compatible(
      {
        [MODELS]: [listed()],
        [CHAT]: [events({ error: { message: "token k-live-90ab rejected" } })],
      },
      { apiKey: "k-live-90ab" },
    );

    const failure = await failureOf(provider.run(providerRequest()));

    expect(failure.failure).toBe("unavailable");
    expect(failure.message).toContain("token [a key] rejected");
    expect(failure.message).not.toContain("90ab");
  });

  it("reads events with comments, data without a space, CRLF and no last blank line", async () => {
    const text =
      ": keep-alive\r\n\r\n" +
      `data:${JSON.stringify(delta({ content: '{"values":' }))}\r\n\r\n` +
      `data: ${JSON.stringify(delta({ content: '{"title":"Città"}' }))}\n\n` +
      `data: ${JSON.stringify(delta({ content: ',"evidence":[]}' }, "stop"))}`;
    const { provider } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [streamed(text, SSE, 1)],
    });

    const answer = await provider.run(providerRequest());

    expect(answer).toMatchObject({
      status: "answered",
      output: { values: { title: "Città" }, evidence: [] },
    });
  });

  it("stops reading at [DONE]", async () => {
    const { provider } = compatible({
      [MODELS]: [listed()],
      [CHAT]: [
        events(
          delta({ content: "{}" }, "stop"),
          "data: [DONE]\n\n",
          delta({ content: "after the end" }),
        ),
      ],
    });

    const answer = await provider.run(providerRequest());

    expect(answer).toMatchObject({ status: "answered", output: {} });
  });

  it("lists the server's models, with the context when the server says it", async () => {
    const { provider } = compatible({
      [MODELS]: [
        json({
          data: [
            { id: "big", max_model_len: 32_768 },
            { id: "small" },
            { name: "x" },
          ],
        }),
      ],
    });

    const models = await provider.listModels?.(new AbortController().signal);

    expect(models).toEqual([
      { id: "big", contextTokens: 32_768 },
      { id: "small" },
    ]);
  });
});

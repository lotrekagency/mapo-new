import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MODELS,
  createAnthropicProvider,
} from "../runtime/server/providers/anthropic";
import type { AnthropicSettings } from "../runtime/server/providers/anthropic";
import { MapoAiProviderError } from "../runtime/server/providers/types";
import type { MapoAiProviderFailure } from "../runtime/server/providers/types";
import {
  documented,
  fakeServer,
  json,
  providerRequest,
  streamed,
} from "./servers";
import type { Served } from "./servers";

/**
 * A new address for each test: the provider remembers, by address and
 * model, the parameters a model refused.
 */
let servers = 0;
function anthropic(
  answers: Record<string, Served[]>,
  settings: Partial<AnthropicSettings> = {},
) {
  servers += 1;
  const server = fakeServer(answers);
  const provider = createAnthropicProvider({
    baseURL: `https://proxy-${servers}.test/v1`,
    apiKey: "sk-ant-test-key",
    fetch: server.fetch,
    ...settings,
  });
  return { provider, ...server };
}

const SSE = { headers: { "content-type": "text/event-stream" } };
const MESSAGES = "/v1/messages";
const OPUS = "claude-opus-5-5";
const ANSWER = {
  values: { title: "About us", body: "We are a small studio in Milan." },
  evidence: [
    { field: "title", quote: "Title: About us", where: "" },
    {
      field: "body",
      quote: "Body: We are a small studio in Milan.",
      where: "",
    },
  ],
};

/** A documented stream, in chunks of `size` bytes. */
function stream(name: string, size = 64): Response {
  return streamed(documented(name), SSE, size);
}

/** A stream of the events given. */
function events(...values: Record<string, unknown>[]): Response {
  return streamed(
    values
      .map(
        (value) =>
          `event: ${String(value.type)}\ndata: ${JSON.stringify(value)}\n\n`,
      )
      .join(""),
    SSE,
  );
}

/** Anthropic's error, as its API answers one. */
function error(status: number, type: string, message: string): Response {
  return json({ type: "error", error: { type, message } }, status);
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function failureOf(promise: Promise<unknown>): Promise<{
  failure: MapoAiProviderFailure;
  message: string;
  retryAfter?: number;
}> {
  const thrown: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(thrown instanceof MapoAiProviderError)) {
    throw new Error(`Not a provider's failure: ${String(thrown)}`);
  }
  return {
    failure: thrown.failure,
    message: thrown.message,
    ...(thrown.retryAfter !== undefined
      ? { retryAfter: thrown.retryAfter }
      : {}),
  };
}

/** The body of a call, as a record. */
function bodyOf(call: { body: unknown } | undefined): Record<string, unknown> {
  const body = call?.body;
  if (typeof body !== "object" || body === null) throw new Error("No body");
  return body as Record<string, unknown>;
}

describe("the anthropic provider", () => {
  it("offers Opus 5.5 first, then Sonnet 5.5 and Haiku 5.5", () => {
    const { provider } = anthropic({});

    expect(provider.id).toBe("anthropic");
    expect(provider.models).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ]);
    expect(ANTHROPIC_MODELS[0]).toBe(OPUS);
  });

  it("reads the streamed answer of the Messages API, not its thinking, and its counts", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [stream("anthropic-answered.sse", 41)],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer).toEqual({
      status: "answered",
      output: ANSWER,
      usage: { inputTokens: 2210, outputTokens: 398 },
    });
  });

  it("speaks version 2026-10-21 with its key, asks for the schema, little effort and Anthropic's fallbacks", async () => {
    const { provider, calls } = anthropic({
      [MESSAGES]: [stream("anthropic-answered.sse")],
    });
    const request = providerRequest({ model: OPUS });

    await provider.run(request);

    const [call] = calls;
    expect(call?.method).toBe("POST");
    expect(call?.redirect).toBe("manual");
    expect(call?.signal).toBe(request.signal);
    expect(call?.headers).toMatchObject({
      "x-api-key": "sk-ant-test-key",
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    });
    expect(call?.headers).not.toHaveProperty("authorization");
    const body = bodyOf(call);
    expect(body).toEqual({
      model: OPUS,
      max_tokens: 4096 + 8192,
      stream: true,
      system: [{ type: "text", text: request.prompt.instructions }],
      messages: [{ role: "user", content: request.prompt.input }],
      output_config: {
        format: { type: "json_schema", schema: request.schema },
        effort: "low",
      },
      fallbacks: "default",
    });
    // No sampling parameter, no thinking setting: the version refuses the
    // first, and Opus 5.5 always thinks.
    for (const key of ["temperature", "top_p", "top_k", "thinking"]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(JSON.stringify(body.system)).not.toContain(
      "The answer's JSON schema",
    );
  });

  it("asks the effort the app sets, with room for its thinking", async () => {
    const { provider, calls } = anthropic(
      { [MESSAGES]: [stream("anthropic-answered.sse")] },
      { effort: "medium" },
    );

    await provider.run(providerRequest({ model: OPUS }));

    expect(bodyOf(calls[0])).toMatchObject({
      max_tokens: 4096 + 16_384,
      output_config: { effort: "medium" },
    });
  });

  it("marks only the stable part of the prompt for the cache, with promptCache, and counts it", async () => {
    const { provider, calls } = anthropic(
      { [MESSAGES]: [stream("anthropic-cached.sse")] },
      { promptCache: true },
    );
    const request = providerRequest({ model: OPUS });

    const answer = await provider.run(request);

    expect(bodyOf(calls[0]).system).toEqual([
      {
        type: "text",
        text: request.prompt.instructions,
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(bodyOf(calls[0]).messages).toEqual([
      { role: "user", content: request.prompt.input },
    ]);
    expect(answer.usage).toEqual({
      inputTokens: 180 + 2030,
      outputTokens: 398,
      cacheReadTokens: 2030,
    });
  });

  it("counts the prompt written to the cache in the whole prompt", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: {
              model: OPUS,
              usage: {
                input_tokens: 180,
                cache_creation_input_tokens: 2030,
                cache_read_input_tokens: 0,
                output_tokens: 3,
              },
            },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: JSON.stringify(ANSWER) },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 398 },
          },
          { type: "message_stop" },
        ),
      ],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer.usage).toEqual({
      inputTokens: 2210,
      outputTokens: 398,
      cacheWriteTokens: 2030,
    });
  });

  it("writes a listed value as the schema does, since Anthropic does not keep its case", async () => {
    const answer = {
      ...ANSWER,
      evidence: [{ field: "Title", quote: "Title: About us", where: "" }],
    };
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: { model: OPUS, usage: { input_tokens: 9 } },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: JSON.stringify(answer) },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 9 },
          },
          { type: "message_stop" },
        ),
      ],
    });

    const read = await provider.run(providerRequest({ model: OPUS }));

    expect(read).toMatchObject({
      status: "answered",
      output: { evidence: [{ field: "title", quote: "Title: About us" }] },
    });
  });

  it("fails with truncated when the answer reached its cap, with what the call used", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [stream("anthropic-max-tokens.sse")],
    });

    const error: unknown = await provider
      .run(providerRequest({ model: OPUS }))
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(MapoAiProviderError);
    expect(error).toMatchObject({
      failure: "truncated",
      message: expect.stringContaining(
        "its thinking included: the answer is cut",
      ),
      usage: { inputTokens: 2210, outputTokens: 12288 },
    });
  });

  it("reads a refusal of the safety filters, with the kind of request", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [stream("anthropic-refusal.sse")],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer).toEqual({
      status: "refused",
      refusal: "Anthropic's safety filters declined the request (bio)",
      usage: { inputTokens: 2210, outputTokens: 0 },
    });
  });

  it("reads the model's own words when it refuses, never a piece of an answer", async () => {
    const refusal = (text: string) =>
      events(
        {
          type: "message_start",
          message: { model: OPUS, usage: { input_tokens: 10 } },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        },
        {
          type: "message_delta",
          delta: { stop_reason: "refusal" },
          usage: { output_tokens: 9 },
        },
        { type: "message_stop" },
      );
    const { provider } = anthropic({
      [MESSAGES]: [
        refusal("I can't help with this source."),
        refusal('{"values":{"title":"Ab'),
      ],
    });

    const words = await provider.run(providerRequest({ model: OPUS }));
    const piece = await provider.run(providerRequest({ model: OPUS }));

    expect(words).toMatchObject({
      status: "refused",
      refusal: "I can't help with this source.",
    });
    expect(piece).toMatchObject({
      status: "refused",
      refusal: "Anthropic's safety filters declined the request",
    });
  });

  it("names the model that answered when the request fell back on another, and counts every attempt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider } = anthropic({
      [MESSAGES]: [stream("anthropic-fallback.sse")],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer).toEqual({
      status: "answered",
      output: ANSWER,
      model: "claude-opus-5",
      usage: { inputTokens: 2210 + 2210, outputTokens: 402 },
    });
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "claude-opus-5-5 declined the request, so claude-opus-5 answered it, at its own prices (fallbacks)",
    );
  });

  it("names the model of a request served by its fallback again, which has no fallback block", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: { model: "claude-opus-5", usage: { input_tokens: 2210 } },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: JSON.stringify(ANSWER) },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: {
              output_tokens: 402,
              iterations: [
                {
                  type: "fallback_message",
                  model: "claude-opus-5",
                  input_tokens: 2210,
                  output_tokens: 402,
                },
              ],
            },
          },
          { type: "message_stop" },
        ),
      ],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer).toMatchObject({
      status: "answered",
      model: "claude-opus-5",
    });
  });

  it("names no other model when the API only writes the asked one's full name", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: {
              model: "claude-haiku-4-5-20251001",
              usage: { input_tokens: 9 },
            },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "{}" },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 2 },
          },
          { type: "message_stop" },
        ),
      ],
    });

    const answer = await provider.run(
      providerRequest({ model: "claude-haiku-4-5" }),
    );

    expect(answer).not.toHaveProperty("model");
  });

  it("tells an overloaded API from a rate limit, in the stream and before it", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: { model: OPUS, usage: { input_tokens: 9 } },
          },
          {
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
          },
        ),
        error(529, "overloaded_error", "Overloaded"),
        json(
          {
            type: "error",
            error: {
              type: "rate_limit_error",
              message:
                "Number of request tokens has exceeded your per-minute rate limit",
            },
          },
          429,
          { "retry-after": "30" },
        ),
      ],
    });

    const midStream = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );
    const busy = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );
    const limited = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(midStream).toEqual({
      failure: "unavailable",
      message: expect.stringContaining(
        "failed while answering (overloaded_error): Overloaded",
      ),
    });
    expect(busy.failure).toBe("unavailable");
    expect(limited).toMatchObject({ failure: "rate-limit", retryAfter: 30 });
  });

  it("fails with unavailable for a stream that ends before the model said why it stopped", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: { model: OPUS, usage: { input_tokens: 9 } },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "{" },
          },
        ),
        streamed("", SSE),
      ],
    });

    const cut = await failureOf(provider.run(providerRequest({ model: OPUS })));
    const empty = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(cut.failure).toBe("unavailable");
    expect(empty.failure).toBe("invalid-response");
  });

  it("fails with too-long for a prompt longer than the model reads", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [json(documented("anthropic-context.json"), 400)],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(failure).toEqual({
      failure: "too-long",
      message: expect.stringContaining(
        "prompt is too long: 1048576 tokens > 1000000 maximum",
      ),
    });
  });

  it("says when the answer's schema is too complex for Anthropic's structured outputs", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [json(documented("anthropic-too-complex.json"), 400)],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(failure).toEqual({
      failure: "refused-request",
      message: expect.stringContaining(
        "could not compile the answer's schema for claude-opus-5-5, too large or too nested",
      ),
    });
  });

  it("says that an account without credit is not a rate limit", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        error(
          400,
          "invalid_request_error",
          "Your credit balance is too low to access the Anthropic API.",
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(failure).toEqual({
      failure: "refused-request",
      message: expect.stringContaining("waiting does not help"),
    });
  });

  it("asks again without an effort the model does not take, and remembers it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = anthropic({
      [MESSAGES]: [
        error(
          400,
          "invalid_request_error",
          "This model does not support the effort parameter.",
        ),
        stream("anthropic-answered.sse"),
        stream("anthropic-answered.sse"),
      ],
    });

    await provider.run(providerRequest({ model: "claude-haiku-4-5" }));
    await provider.run(providerRequest({ model: "claude-haiku-4-5" }));

    const configs = calls.map((call) => bodyOf(call).output_config);
    expect(configs[0]).toHaveProperty("effort", "low");
    expect(configs[1]).not.toHaveProperty("effort");
    expect(configs[2]).not.toHaveProperty("effort");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("asks again without the fallbacks and their beta when the server does not take them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = anthropic({
      [MESSAGES]: [
        error(
          400,
          "invalid_request_error",
          "fallbacks: Extra inputs are not permitted",
        ),
        stream("anthropic-answered.sse"),
      ],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer.status).toBe("answered");
    expect(bodyOf(calls[1])).not.toHaveProperty("fallbacks");
    expect(calls[1]?.headers).not.toHaveProperty("anthropic-beta");
  });

  it("calls Anthropic's own servers only with a key, and another address without one", async () => {
    const own = fakeServer({});
    const keyless = createAnthropicProvider({
      baseURL: "https://api.anthropic.com/v1",
      fetch: own.fetch,
    });
    const { provider, calls } = anthropic(
      { [MESSAGES]: [stream("anthropic-answered.sse")] },
      { apiKey: undefined },
    );

    const failure = await failureOf(
      keyless.run(providerRequest({ model: OPUS })),
    );
    await provider.run(providerRequest({ model: OPUS }));

    expect(failure).toEqual({
      failure: "refused-request",
      message:
        'The provider "anthropic" has no key: set NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY in the server\'s environment',
    });
    expect(own.calls).toEqual([]);
    expect(calls[0]?.headers).not.toHaveProperty("x-api-key");
    expect(calls[0]?.headers).toHaveProperty("anthropic-version", "2026-10-21");
  });

  it("names the fallback model from the billed attempt, even when the message carries a dated name", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const served = (startedAs: string) =>
      events(
        {
          type: "message_start",
          message: { model: startedAs, usage: { input_tokens: 2210 } },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: JSON.stringify(ANSWER) },
        },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: {
            output_tokens: 402,
            iterations: [
              {
                type: "message",
                model: OPUS,
                input_tokens: 2210,
                output_tokens: 0,
              },
              {
                type: "fallback_message",
                model: "claude-opus-5",
                input_tokens: 2210,
                output_tokens: 402,
              },
            ],
          },
        },
        { type: "message_stop" },
      );
    const { provider } = anthropic({
      [MESSAGES]: [served("claude-opus-5-5-20261001"), served(OPUS)],
    });

    const dated = await provider.run(providerRequest({ model: OPUS }));
    const asked = await provider.run(providerRequest({ model: OPUS }));

    expect(dated).toMatchObject({ model: "claude-opus-5" });
    expect(asked).toMatchObject({ model: "claude-opus-5" });
  });

  it("keeps the cache's counts when the end of the message restates the prompt's count alone", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: {
              model: OPUS,
              usage: {
                input_tokens: 180,
                cache_read_input_tokens: 2030,
                cache_creation_input_tokens: 0,
                output_tokens: 1,
              },
            },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: JSON.stringify(ANSWER) },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { input_tokens: 180, output_tokens: 398 },
          },
          { type: "message_stop" },
        ),
      ],
    });

    const answer = await provider.run(providerRequest({ model: OPUS }));

    expect(answer.usage).toEqual({
      inputTokens: 2210,
      outputTokens: 398,
      cacheReadTokens: 2030,
    });
  });

  it("carries what a call used when the stream breaks, and fails with too-long when the context runs out", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        events(
          {
            type: "message_start",
            message: { model: OPUS, usage: { input_tokens: 9000 } },
          },
          {
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
          },
        ),
        events(
          {
            type: "message_start",
            message: { model: OPUS, usage: { input_tokens: 9000 } },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "model_context_window_exceeded" },
            usage: { output_tokens: 7 },
          },
          { type: "message_stop" },
        ),
      ],
    });

    const broken: unknown = await provider
      .run(providerRequest({ model: OPUS }))
      .catch((thrown: unknown) => thrown);
    const long = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(broken).toMatchObject({
      failure: "unavailable",
      usage: { inputTokens: 9000, outputTokens: 0 },
    });
    expect(long.failure).toBe("too-long");
  });

  it("reads a prompt and a cap that exceed the context as a prompt too long", async () => {
    const { provider } = anthropic({
      [MESSAGES]: [
        error(
          400,
          "invalid_request_error",
          "input length and `max_tokens` exceed context limit: 990000 + 20480 > 1000000, decrease input length or `max_tokens` and try again",
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(failure.failure).toBe("too-long");
  });

  it("keeps the effort for a refusal that only names it, and remembers a parameter left out only once a call goes without it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = anthropic({
      [MESSAGES]: [
        error(
          400,
          "invalid_request_error",
          "output_config.format.schema.properties.effort: Field required",
        ),
        error(
          400,
          "invalid_request_error",
          "This model does not support the effort parameter.",
        ),
        error(529, "overloaded_error", "Overloaded"),
        stream("anthropic-answered.sse"),
      ],
    });

    const named = await failureOf(
      provider.run(providerRequest({ model: "claude-haiku-4-5" })),
    );
    const busy = await failureOf(
      provider.run(providerRequest({ model: "claude-haiku-4-5" })),
    );
    await provider.run(providerRequest({ model: "claude-haiku-4-5" }));

    expect(named.failure).toBe("refused-request");
    expect(busy.failure).toBe("unavailable");
    const efforts = calls.map((call) => bodyOf(call).output_config);
    expect(
      efforts.map((config) => (config as Record<string, unknown>).effort),
    ).toEqual(["low", "low", undefined, "low"]);
  });

  it("asks again without the fallbacks when the server does not know their beta", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = anthropic({
      [MESSAGES]: [
        error(
          400,
          "invalid_request_error",
          "Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header. Please consult our documentation at docs.anthropic.com or try again without the header.",
        ),
        stream("anthropic-answered.sse"),
      ],
    });

    await provider.run(providerRequest({ model: OPUS }));

    expect(bodyOf(calls[1])).not.toHaveProperty("fallbacks");
    expect(calls[1]?.headers).not.toHaveProperty("anthropic-beta");
  });

  it("masks the exact key a proxy repeats", async () => {
    const { provider } = anthropic(
      {
        [MESSAGES]: [
          error(
            401,
            "authentication_error",
            "invalid x-api-key: pk-proxy-1a2b3c4d",
          ),
        ],
      },
      { apiKey: "pk-proxy-1a2b3c4d" },
    );

    const failure = await failureOf(
      provider.run(providerRequest({ model: OPUS })),
    );

    expect(failure.message).toContain("invalid x-api-key: [a key]");
    expect(failure.message).not.toContain("1a2b3c4d");
  });

  it("lists the models the key may use, with the context each reads", async () => {
    const { provider, calls } = anthropic({
      "/v1/models": [json(documented("anthropic-models.json"))],
    });

    const models = await provider.listModels?.(new AbortController().signal);

    expect(models).toEqual([
      { id: "claude-opus-5-5", contextTokens: 1_000_000, images: true },
      { id: "claude-sonnet-5-5", contextTokens: 1_000_000, images: true },
      { id: "claude-haiku-5-5", contextTokens: 1_000_000, images: true },
    ]);
    expect(calls[0]?.headers["x-api-key"]).toBe("sk-ant-test-key");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_MODELS,
  createOpenAiProvider,
} from "../runtime/server/providers/openai";
import type { OpenAiSettings } from "../runtime/server/providers/openai";
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
function openai(
  answers: Record<string, Served[]>,
  settings: Partial<OpenAiSettings> = {},
) {
  servers += 1;
  const server = fakeServer(answers);
  const provider = createOpenAiProvider({
    baseURL: `https://proxy-${servers}.test/v1`,
    apiKey: "sk-test-key",
    fetch: server.fetch,
    ...settings,
  });
  return { provider, ...server };
}

const SSE = { headers: { "content-type": "text/event-stream" } };
const RESPONSES = "/v1/responses";
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

/** The documented answer, with other counts in the event that ends it. */
function answeredWith(usage: Record<string, unknown>): Response {
  const text = documented("openai-answered.sse").replace(
    /"usage":\{"input_tokens":2390.*?"total_tokens":2802\}/,
    `"usage":${JSON.stringify(usage)}`,
  );
  return streamed(text, SSE);
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

/** The body of the first call to the Responses API, as a record. */
function firstBody(calls: { path: string; body: unknown }[]) {
  const body = calls.find((call) => call.path === RESPONSES)?.body;
  if (typeof body !== "object" || body === null) throw new Error("No body");
  return body as Record<string, unknown>;
}

describe("the openai provider", () => {
  it("offers GPT-6.1 Sol first, and GPT-6 Luna", () => {
    const { provider } = openai({});

    expect(provider.id).toBe("openai");
    expect(provider.models).toEqual(["gpt-6.1-sol", "gpt-6-luna"]);
    expect(OPENAI_MODELS[0]).toBe("gpt-6.1-sol");
    expect(provider.capabilities).toMatchObject({
      structuredOutput: "strict",
      streaming: true,
    });
  });

  it("reads the streamed answer of the Responses API, and its counts", async () => {
    const { provider } = openai({
      [RESPONSES]: [stream("openai-answered.sse", 37)],
    });

    const answer = await provider.run(
      providerRequest({ model: "gpt-6.1-sol" }),
    );

    expect(answer).toEqual({
      status: "answered",
      output: ANSWER,
      usage: { inputTokens: 2390, outputTokens: 412 },
    });
  });

  it("asks for the schema strictly, stores nothing, reasons little and sends no sampling", async () => {
    const { provider, calls } = openai({
      [RESPONSES]: [stream("openai-answered.sse")],
    });
    const request = providerRequest({ model: "gpt-6.1-sol" });

    await provider.run(request);

    const [call] = calls;
    expect(call?.method).toBe("POST");
    expect(call?.headers.authorization).toBe("Bearer sk-test-key");
    // A redirect would take the key and the prompt elsewhere; the signal
    // lets the gateway stop a paid generation.
    expect(call?.redirect).toBe("manual");
    expect(call?.signal).toBe(request.signal);
    const body = firstBody(calls);
    expect(body).toEqual({
      model: "gpt-6.1-sol",
      stream: true,
      store: false,
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: request.prompt.instructions }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: request.prompt.input }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mapo_ai_answer",
          strict: true,
          schema: request.schema,
        },
      },
      // The answer's room for a small form, and the reasoning's for "low".
      max_output_tokens: 4096 + 8192,
      reasoning: { effort: "low" },
      prompt_cache_options: { mode: "explicit" },
    });
    // OpenAI shows the schema to the model: the prompt does not repeat it.
    expect(JSON.stringify(body.input)).not.toContain(
      "The answer's JSON schema",
    );
  });

  it("asks the effort the app sets, with room for its reasoning", async () => {
    const { provider, calls } = openai(
      { [RESPONSES]: [stream("openai-answered.sse")] },
      { effort: "high" },
    );

    await provider.run(providerRequest({ model: "gpt-6.1-sol" }));

    expect(firstBody(calls)).toMatchObject({
      reasoning: { effort: "high" },
      max_output_tokens: 4096 + 32_768,
    });
  });

  it("writes only the stable part of the prompt to the cache, with promptCache", async () => {
    const { provider, calls } = openai(
      { [RESPONSES]: [stream("openai-answered.sse")] },
      { promptCache: true },
    );
    const request = providerRequest({ model: "gpt-6.1-sol" });

    await provider.run(request);

    const body = firstBody(calls);
    expect(body.prompt_cache_options).toEqual({ mode: "explicit" });
    expect(body.input).toEqual([
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: request.prompt.instructions,
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: request.prompt.input }],
      },
    ]);
  });

  it("counts the prompt read from and written to the cache", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        answeredWith({
          input_tokens: 2390,
          input_tokens_details: { cached_tokens: 1920, cache_write_tokens: 0 },
          output_tokens: 410,
        }),
        answeredWith({
          input_tokens: 2390,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1920 },
          output_tokens: 410,
        }),
      ],
    });

    const read = await provider.run(providerRequest({ model: "gpt-6.1-sol" }));
    const written = await provider.run(
      providerRequest({ model: "gpt-6.1-sol" }),
    );

    expect(read.usage).toEqual({
      inputTokens: 2390,
      outputTokens: 410,
      cacheReadTokens: 1920,
    });
    expect(written.usage).toEqual({
      inputTokens: 2390,
      outputTokens: 410,
      cacheWriteTokens: 1920,
    });
  });

  it("fails with truncated when the answer reached its cap, with what the call used", async () => {
    const { provider } = openai({
      [RESPONSES]: [stream("openai-incomplete.sse")],
    });

    const error: unknown = await provider
      .run(providerRequest({ model: "gpt-6.1-sol" }))
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(MapoAiProviderError);
    expect(error).toMatchObject({
      failure: "truncated",
      message: expect.stringContaining("the answer is cut"),
      // The cut answer is paid: the audit keeps its tokens.
      usage: { inputTokens: 2390, outputTokens: 12288 },
    });
  });

  it("reads an error in the stream for the account's credit or the context", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        events({
          type: "error",
          code: "insufficient_quota",
          message: "You exceeded your current quota.",
        }),
        events({
          type: "error",
          code: "context_length_exceeded",
          message: "Your input exceeds the context window of this model.",
        }),
      ],
    });

    const broke = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    const long = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(broke.failure).toBe("refused-request");
    expect(long.failure).toBe("too-long");
  });

  it("keeps a thousand characters of a refusal at most", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        events(
          { type: "response.refusal.delta", delta: "No. ".repeat(500) },
          {
            type: "response.completed",
            response: {
              status: "completed",
              usage: { input_tokens: 10, output_tokens: 600 },
            },
          },
        ),
      ],
    });

    const answer = await provider.run(
      providerRequest({ model: "gpt-6.1-sol" }),
    );

    expect(answer.status === "refused" && answer.refusal.length).toBe(1000);
  });

  it("masks the exact key a proxy repeats, whatever it looks like", async () => {
    const { provider } = openai(
      {
        [RESPONSES]: [
          json(
            {
              error: {
                message: "Invalid token gw-proxy-7f3a9c2e for this route",
              },
            },
            401,
          ),
        ],
      },
      { apiKey: "gw-proxy-7f3a9c2e" },
    );

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure.message).toContain("Invalid token [a key] for this route");
    expect(failure.message).not.toContain("7f3a9c2e");
  });

  it("reads the model's refusal, and the content filter's", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        stream("openai-refusal.sse", 23),
        events(
          { type: "response.output_text.delta", delta: '{"values":' },
          {
            type: "response.incomplete",
            response: {
              status: "incomplete",
              incomplete_details: { reason: "content_filter" },
              usage: { input_tokens: 2390, output_tokens: 7 },
            },
          },
        ),
      ],
    });

    const refused = await provider.run(
      providerRequest({ model: "gpt-6.1-sol" }),
    );
    const filtered = await provider.run(
      providerRequest({ model: "gpt-6.1-sol" }),
    );

    expect(refused).toEqual({
      status: "refused",
      refusal: "I'm sorry, I can't help with that request.",
      usage: { inputTokens: 2390, outputTokens: 20 },
    });
    expect(filtered).toEqual({
      status: "refused",
      refusal: "OpenAI's content filter stopped the answer",
      usage: { inputTokens: 2390, outputTokens: 7 },
    });
  });

  it("fails with unavailable when the response failed, or a rate limit hit mid-stream", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        stream("openai-failed.sse"),
        events({
          type: "error",
          code: "rate_limit_exceeded",
          message: "Rate limit reached for gpt-6.1-sol",
          param: null,
        }),
      ],
    });

    const failed = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    const limited = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failed).toEqual({
      failure: "unavailable",
      message: expect.stringContaining(
        "failed while answering (server_error): The server had an error",
      ),
    });
    expect(limited.failure).toBe("rate-limit");
  });

  it("fails with unavailable for a stream that ends before the response, and invalid-response for none", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        events({ type: "response.output_text.delta", delta: '{"values":' }),
        streamed("", SSE),
      ],
    });

    const cut = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    const empty = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(cut.failure).toBe("unavailable");
    expect(empty.failure).toBe("invalid-response");
  });

  it("fails with too-long when the prompt does not fit the model's context", async () => {
    const { provider } = openai({
      [RESPONSES]: [json(documented("openai-context.json"), 400)],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure).toEqual({
      failure: "too-long",
      message: expect.stringContaining("exceeds the context window"),
    });
  });

  it("keeps the rate limit of an account without a payment method, whose words name billing", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message:
                "Rate limit reached for gpt-6.1-sol in organization org-x on tokens per min (TPM): Limit 30000, Used 29800. Visit https://platform.openai.com/account/rate-limits to learn more. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.",
              type: "tokens",
              code: "rate_limit_exceeded",
            },
          },
          429,
          { "retry-after": "20" },
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure).toMatchObject({ failure: "rate-limit", retryAfter: 20 });
  });

  it("reads a prompt too long by OpenAI's code, and by its words for the input's limit", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message: "This request is too large for the model.",
              code: "context_length_exceeded",
            },
          },
          400,
        ),
        json(
          {
            error: {
              message:
                "Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 300000 tokens.",
            },
          },
          400,
        ),
      ],
    });

    const byCode = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    const byWords = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(byCode.failure).toBe("too-long");
    expect(byWords.failure).toBe("too-long");
  });

  it("tells a rate limit, with its wait, from an account without credit", async () => {
    const { provider } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message: "Rate limit reached",
              code: "rate_limit_exceeded",
            },
          },
          429,
          { "retry-after": "12" },
        ),
        json(
          {
            error: {
              message:
                "You exceeded your current quota, please check your plan and billing details.",
              code: "insufficient_quota",
            },
          },
          429,
        ),
      ],
    });

    const limited = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    const broke = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(limited).toMatchObject({ failure: "rate-limit", retryAfter: 12 });
    expect(broke).toEqual({
      failure: "refused-request",
      message: expect.stringContaining("waiting does not help"),
    });
  });

  it("never logs the key OpenAI repeats when it refuses one", async () => {
    const { provider } = openai({
      [RESPONSES]: [json(documented("openai-key.json"), 401)],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure.failure).toBe("refused-request");
    expect(failure.message).toContain("Incorrect API key provided: [a key]");
    expect(failure.message).not.toContain("WXYZ");
  });

  it("asks again without a parameter the model does not take, and remembers it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message:
                "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
              type: "invalid_request_error",
              param: "reasoning.effort",
              code: "unsupported_parameter",
            },
          },
          400,
        ),
        stream("openai-answered.sse"),
        stream("openai-answered.sse"),
      ],
    });

    const first = await provider.run(providerRequest({ model: "gpt-4.1" }));
    const second = await provider.run(providerRequest({ model: "gpt-4.1" }));

    expect(first.status).toBe("answered");
    expect(second.status).toBe("answered");
    const bodies = calls.map((call) => call.body as Record<string, unknown>);
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toHaveProperty("reasoning");
    expect(bodies[1]).not.toHaveProperty("reasoning");
    expect(bodies[2]).not.toHaveProperty("reasoning");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'gpt-4.1 does not take "reasoning"',
    );
  });

  it("leaves out the cache's options for a model that does not take them, breakpoint included", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = openai(
      {
        [RESPONSES]: [
          json(
            {
              error: { message: "Unknown parameter: 'prompt_cache_options'." },
            },
            400,
          ),
          stream("openai-answered.sse"),
        ],
      },
      { promptCache: true },
    );

    await provider.run(providerRequest({ model: "gpt-5" }));

    const retried = calls[1]?.body as Record<string, unknown>;
    expect(retried).not.toHaveProperty("prompt_cache_options");
    expect(JSON.stringify(retried.input)).not.toContain(
      "prompt_cache_breakpoint",
    );
    // Without the options OpenAI caches by its own rules: the log says it.
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "may write the whole prompt to its cache and bill the writing",
    );
  });

  it("keeps the cache's options for a refusal that does not say the model does not take them", async () => {
    const { provider, calls } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message:
                "prompt_cache_options.mode must be used with at least one prompt_cache_breakpoint",
              type: "invalid_request_error",
            },
          },
          400,
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure.failure).toBe("refused-request");
    expect(calls).toHaveLength(1);
  });

  it("fails, with the cache on, for a refusal of the breakpoint alone, rather than go on without the cache's options", async () => {
    const { provider, calls } = openai(
      {
        [RESPONSES]: [
          json(
            {
              error: {
                message:
                  "Unknown parameter: 'input[0].content[0].prompt_cache_breakpoint'.",
                type: "invalid_request_error",
                param: "input[0].content[0].prompt_cache_breakpoint",
                code: "unknown_parameter",
              },
            },
            400,
          ),
        ],
      },
      { promptCache: true },
    );

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure.failure).toBe("refused-request");
    expect(calls).toHaveLength(1);
  });

  it("remembers a parameter left out only once a call without it is taken", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, calls } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message:
                "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
              param: "reasoning.effort",
              code: "unsupported_parameter",
            },
          },
          400,
        ),
        json({ error: { message: "The server had an error" } }, 500),
        stream("openai-answered.sse"),
      ],
    });

    const failed = await failureOf(
      provider.run(providerRequest({ model: "gpt-4.1" })),
    );
    await provider.run(providerRequest({ model: "gpt-4.1" }));

    expect(failed.failure).toBe("unavailable");
    // The call without it failed: the next one sends it again.
    expect(calls[2]?.body).toHaveProperty("reasoning");
  });

  it("never leaves a parameter out for a refusal of the rate, whatever its words", async () => {
    const { provider, calls } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message:
                "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
            },
          },
          429,
        ),
        stream("openai-answered.sse"),
      ],
    });

    const limited = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    await provider.run(providerRequest({ model: "gpt-6.1-sol" }));

    expect(limited.failure).toBe("rate-limit");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toHaveProperty("reasoning");
  });

  it("keeps a schema's refusal that names a field called reasoning as a refusal", async () => {
    const { provider, calls } = openai({
      [RESPONSES]: [
        json(
          {
            error: {
              message:
                "Invalid schema for response_format 'mapo_ai_answer': In context=('properties', 'reasoning'), 'minLength' is not permitted.",
              param: "text.format.schema",
              code: "invalid_json_schema",
            },
          },
          400,
        ),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure.failure).toBe("refused-request");
    expect(calls).toHaveLength(1);
  });

  it("gives up on a refusal that names no parameter it may leave out", async () => {
    const { provider, calls } = openai({
      [RESPONSES]: [
        json({ error: { message: "Invalid schema for response_format" } }, 400),
      ],
    });

    const failure = await failureOf(
      provider.run(providerRequest({ model: "gpt-6.1-sol" })),
    );

    expect(failure.failure).toBe("refused-request");
    expect(calls).toHaveLength(1);
  });

  it("calls OpenAI's own servers only with a key, and another address without one", async () => {
    const own = fakeServer({});
    const keyless = createOpenAiProvider({
      baseURL: "https://eu.api.openai.com/v1",
      fetch: own.fetch,
    });
    const { provider, calls } = openai(
      { [RESPONSES]: [stream("openai-answered.sse")] },
      { apiKey: undefined },
    );

    const failure = await failureOf(
      keyless.run(providerRequest({ model: "gpt-6.1-sol" })),
    );
    await provider.run(providerRequest({ model: "gpt-6.1-sol" }));

    expect(failure).toEqual({
      failure: "refused-request",
      message:
        'The provider "openai" has no key: set NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY in the server\'s environment',
    });
    expect(own.calls).toEqual([]);
    expect(calls[0]?.headers).not.toHaveProperty("authorization");
  });

  it("lists the models the key may use", async () => {
    const { provider, calls } = openai({
      "/v1/models": [json(documented("openai-models.json"))],
    });

    const models = await provider.listModels?.(new AbortController().signal);

    expect(models).toEqual([
      { id: "gpt-6.1-sol" },
      { id: "gpt-6-luna" },
      { id: "gpt-6-astra" },
    ]);
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-test-key");
  });
});

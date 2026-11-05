import { describe, expect, it } from "vitest";
import {
  cloudAnswerTokens,
  cloudUsage,
  createDroppedParameters,
  needsKey,
  refusedParameter,
  streamFailure,
  withEnumCase,
} from "../runtime/server/providers/cloud";
import { providerServer } from "../runtime/server/providers/http";

const server = providerServer("OpenAI", {
  baseURL: "https://api.openai.com/v1",
});

describe("what the cloud providers share", () => {
  it("caps an answer by its schema, with room for the reasoning of the effort", () => {
    expect(cloudAnswerTokens("fill", 2000, "low")).toBe(4096 + 8192);
    expect(cloudAnswerTokens("fill", 2000, "medium")).toBe(4096 + 16_384);
    expect(cloudAnswerTokens("extract", 40_000, "high")).toBe(20_000 + 32_768);
  });

  it("asks a key for the provider's own servers only", () => {
    expect(needsKey("https://api.openai.com/v1", "openai.com")).toBe(true);
    expect(needsKey("https://eu.api.openai.com/v1", "openai.com")).toBe(true);
    expect(needsKey("https://api.anthropic.com/v1", "anthropic.com")).toBe(
      true,
    );
    expect(needsKey("https://llm-proxy.example.org/v1", "openai.com")).toBe(
      false,
    );
    // A name that only ends like the provider's is another server.
    expect(needsKey("https://notopenai.com/v1", "openai.com")).toBe(false);
    expect(needsKey("not a url", "openai.com")).toBe(true);
  });

  it("counts the prompt's cache only when a call read or wrote it", () => {
    expect(
      cloudUsage({ input: 100, output: 10, cacheRead: 0, cacheWrite: 0 }),
    ).toEqual({ inputTokens: 100, outputTokens: 10 });
    expect(
      cloudUsage({ input: 100, output: 10, cacheRead: 80, cacheWrite: 5 }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 80,
      cacheWriteTokens: 5,
    });
  });

  it("finds the parameter a refusal says a model does not take, among those still sent", () => {
    const optional = [
      {
        name: "reasoning",
        refused: /unsupported (?:parameter|value)[^.]*\breasoning\b/i,
        without: "",
      },
      {
        name: "prompt_cache_options",
        refused: /unknown parameter[^.]*\bprompt_cache_options\b/i,
        without: "",
      },
    ];
    const byWords = {
      message:
        "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
    };
    const byCode = {
      message: "This parameter is not supported.",
      code: "unsupported_parameter",
      param: "prompt_cache_options.mode",
    };

    expect(refusedParameter(byWords, optional, new Set())?.name).toBe(
      "reasoning",
    );
    expect(refusedParameter(byCode, optional, new Set())?.name).toBe(
      "prompt_cache_options",
    );
    expect(
      refusedParameter(byWords, optional, new Set(["reasoning"])),
    ).toBeUndefined();
  });

  it("keeps a parameter for a refusal that only names it", () => {
    const optional = [
      {
        name: "reasoning",
        refused: /unsupported (?:parameter|value)[^.]*\breasoning\b/i,
        without: "",
      },
    ];

    // A schema error about a field called "reasoning", and a parameter
    // OpenAI names that is not one the call may leave out.
    expect(
      refusedParameter(
        {
          message:
            "Invalid schema for response_format 'mapo_ai_answer': In context=('properties', 'reasoning'), 'minLength' is not permitted.",
        },
        optional,
        new Set(),
      ),
    ).toBeUndefined();
    expect(
      refusedParameter(
        {
          message: "Unknown parameter.",
          code: "unknown_parameter",
          param: "input[0].content[0].prompt_cache_breakpoint",
        },
        optional,
        new Set(),
      ),
    ).toBeUndefined();
  });

  it("remembers a model's refused parameters for ten minutes, by server", () => {
    const dropped = createDroppedParameters();
    dropped.add("https://a", "m", "reasoning", 0);
    dropped.add("https://a", "m", "prompt_cache_options", 60_000);

    expect([...dropped.get("https://a", "m", 9 * 60_000)]).toEqual([
      "reasoning",
      "prompt_cache_options",
    ]);
    expect([...dropped.get("https://b", "m", 0)]).toEqual([]);
    expect([...dropped.get("https://a", "other", 0)]).toEqual([]);
    expect([...dropped.get("https://a", "m", 60_000 + 10 * 60_000)]).toEqual(
      [],
    );
  });

  it("keeps 200 models' refusals at most, dropping the oldest", () => {
    const dropped = createDroppedParameters();
    for (let index = 0; index < 201; index += 1) {
      dropped.add("https://a", `m${index}`, "reasoning", 0);
    }

    expect(dropped.get("https://a", "m0", 0).size).toBe(0);
    expect(dropped.get("https://a", "m200", 0).size).toBe(1);
  });

  it("reads an error of a stream as a rate limit or a failure, without a key", () => {
    const limited = streamFailure(server, {
      type: "error",
      code: "rate_limit_exceeded",
      message: "Rate limit reached",
    });
    const overloaded = streamFailure(server, {
      type: "error",
      error: { type: "overloaded_error", message: "Overloaded" },
    });
    const failed = streamFailure(server, {
      code: "server_error",
      message: "Bad key sk-proj-abcdefghijkl1234 was sent",
    });

    expect(limited.failure).toBe("rate-limit");
    expect(overloaded.failure).toBe("unavailable");
    expect(overloaded.message).toBe(
      "OpenAI at https://api.openai.com/v1 failed while answering (overloaded_error): Overloaded",
    );
    expect(failed.message).toContain("Bad key [a key] was sent");
    expect(failed.message).not.toContain("1234");
  });

  it("writes a listed value as its schema does, when only its case differs", () => {
    const schema = {
      type: "object",
      properties: {
        values: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["", "draft", "published"] },
            title: { type: "string" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  _template: { type: "string", enum: ["text", "faq"] },
                },
              },
            },
          },
        },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: ["status", "title"] },
            },
          },
        },
      },
    };
    const answer = {
      values: {
        status: "Draft",
        title: "Draft",
        blocks: [{ _template: "FAQ" }, { _template: "Quote" }],
      },
      evidence: [{ field: "Title", quote: "Draft" }],
    };

    expect(withEnumCase(answer, schema)).toEqual({
      values: {
        status: "draft",
        title: "Draft",
        blocks: [{ _template: "faq" }, { _template: "Quote" }],
      },
      evidence: [{ field: "title", quote: "Draft" }],
    });
  });

  it("leaves a value that matches several listed values but for case, and picks the branch of an item by its type", () => {
    const ambiguous = { type: "string", enum: ["True", "true"] };
    const items = {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["event"] },
              kind: { type: "string", enum: ["concert"] },
            },
          },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["venue"] },
              kind: { type: "string", enum: ["theatre"] },
            },
          },
        ],
      },
    };

    expect(withEnumCase("TRUE", ambiguous)).toBe("TRUE");
    expect(
      withEnumCase(
        [
          { type: "Venue", kind: "Theatre" },
          { type: "EVENT", kind: "Concert" },
        ],
        items,
      ),
    ).toEqual([
      { type: "venue", kind: "theatre" },
      { type: "event", kind: "concert" },
    ]);
  });

  it("keeps a key named __proto__ as data, and what the schema does not describe", () => {
    const schema = {
      type: "object",
      properties: { status: { type: "string", enum: ["draft"] } },
    };
    const answer: unknown = JSON.parse(
      '{"__proto__": {"polluted": true}, "status": "DRAFT", "extra": "X"}',
    );

    const read = withEnumCase(answer, schema);

    expect(Object.hasOwn(read as object, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(read).toMatchObject({ status: "draft", extra: "X" });
  });
});

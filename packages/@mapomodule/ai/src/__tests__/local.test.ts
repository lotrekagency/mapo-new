import { describe, expect, it } from "vitest";
import {
  answerOutput,
  answerTokens,
  contextTokens,
  createModelInfoCache,
  instructionsWithSchema,
  serverURL,
  tokenCount,
  tokensAtLeast,
  tokensAtMost,
} from "../runtime/server/providers/local";

describe("serverURL", () => {
  it("reads an http or https address, without the final /", () => {
    expect(serverURL("http://localhost:11434")).toBe("http://localhost:11434");
    expect(serverURL(" http://localhost:11434/ ")).toBe(
      "http://localhost:11434",
    );
    expect(serverURL("https://llm.example.org/v1/")).toBe(
      "https://llm.example.org/v1",
    );
    expect(serverURL("http://10.0.0.5:8000/v1")).toBe(
      "http://10.0.0.5:8000/v1",
    );
    // An empty query or fragment does not stay where a path is appended.
    expect(serverURL("http://h:1/v1/?")).toBe("http://h:1/v1");
    expect(serverURL("http://h:1/v1#")).toBe("http://h:1/v1");
    expect(serverURL("http://[::1]:11434")).toBe("http://[::1]:11434");
  });

  it("refuses what is not an address the app can call as it wrote it", () => {
    const refused: unknown[] = [
      undefined,
      "",
      "   ",
      42,
      "localhost:11434",
      "ftp://host/",
      "file:///etc/passwd",
      "http://user:secret@host:11434",
      "http://host:11434/?key=1",
      "http://host:11434/#models",
      "not a url",
    ];
    for (const value of refused) expect(serverURL(value)).toBeUndefined();
  });
});

describe("the prompt and its tokens", () => {
  it("puts the answer's schema after the stable part of the prompt", () => {
    const schema = { type: "object", properties: {} };

    const text = instructionsWithSchema(
      { version: 1, instructions: "RULES", input: "SOURCE" },
      schema,
    );

    expect(text).toBe(
      'RULES\n\n# The answer\'s JSON schema\n{"type":"object","properties":{}}',
    );
  });

  it("counts tokens on the high side to make room, on the low side to prove a cut", () => {
    expect(tokensAtMost(1000)).toBe(400);
    expect(tokensAtMost(1001)).toBe(401);
    expect(tokensAtLeast(1000)).toBe(166);
    expect(tokensAtLeast(5)).toBe(0);
  });

  it("caps an answer by its schema, an extraction higher", () => {
    expect(answerTokens("fill", 2000)).toBe(4096);
    expect(answerTokens("fill", 23_111)).toBe(11_556);
    expect(answerTokens("extract", 2000)).toBe(16_384);
    expect(answerTokens("extract", 40_000)).toBe(20_000);
  });

  it("asks a context as a power of two from 8192, within the model's", () => {
    expect(contextTokens(100, 4096)).toBe(8192);
    expect(contextTokens(4097, 4096)).toBe(16_384);
    expect(contextTokens(20_000, 4096)).toBe(32_768);
    expect(contextTokens(20_000, 4096, 9000)).toBe(9000);
    expect(contextTokens(100, 4096, 4096)).toBe(4096);
    expect(contextTokens(2_000_000, 4096)).toBe(1_048_576);
  });

  it("reads token counts as whole numbers from 1", () => {
    expect(tokenCount(632)).toBe(632);
    for (const value of [0, -1, 1.5, "632", null, undefined, Number.NaN]) {
      expect(tokenCount(value)).toBeUndefined();
    }
  });

  it("hands back an answer as JSON when it is, as text otherwise", () => {
    expect(answerOutput('{"values":{}}')).toEqual({ values: {} });
    expect(answerOutput('{"values": tru')).toBe('{"values": tru');
    expect(answerOutput("")).toBe("");
  });
});

describe("createModelInfoCache", () => {
  it("keeps what a server said about a model for ten minutes, by server", () => {
    const cache = createModelInfoCache();
    cache.set("http://a", { id: "m", contextTokens: 4096 }, 0);

    expect(cache.get("http://a", "m", 9 * 60_000)).toEqual({
      id: "m",
      contextTokens: 4096,
    });
    expect(cache.get("http://b", "m", 0)).toBeUndefined();
    expect(cache.get("http://a", "m", 10 * 60_000)).toBeUndefined();
    expect(cache.get("http://a", "m", 0)).toBeUndefined();
  });

  it("keeps 200 models at most, dropping the oldest", () => {
    const cache = createModelInfoCache();
    for (let index = 0; index < 201; index += 1) {
      cache.set("http://a", { id: `m${index}` }, 0);
    }

    expect(cache.get("http://a", "m0", 0)).toBeUndefined();
    expect(cache.get("http://a", "m1", 0)).toEqual({ id: "m1" });
    expect(cache.get("http://a", "m200", 0)).toEqual({ id: "m200" });
  });

  it("tells apart a server and a model whose names would join the same", () => {
    const cache = createModelInfoCache();
    cache.set("http://a", { id: "b/c" }, 0);

    expect(cache.get("http://a/b", "c", 0)).toBeUndefined();
  });
});

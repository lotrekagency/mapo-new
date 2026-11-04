import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapoAiProviderRequest } from "../runtime/server/providers/types";
import { composeMapoAiPrompt } from "../runtime/server/prompts/compose";
import {
  compileExtractContract,
  compileFillContract,
} from "../runtime/shared/contract";
import type { AiContract } from "../runtime/shared/contract";
import { buildAiEntity } from "../runtime/shared/entity";

/** Fresh modules for each test: the fixtures are kept per server process. */
async function mock() {
  return import("../runtime/server/providers/mock");
}

const fields = buildAiEntity({
  fields: {
    type: "object",
    properties: {
      title: { type: "string", title: "Title" },
      città: { type: "string", title: "Città *" },
      published: { type: "boolean", title: "Published" },
      level: {
        type: "string",
        title: "Level",
        oneOf: [
          { const: "draft", title: "Draft" },
          { const: "live", title: "Published" },
        ],
      },
      tags: {
        type: "array",
        title: "Tags",
        items: {
          type: "string",
          oneOf: [
            { const: "a", title: "Alpha" },
            { const: "b", title: "Beta" },
          ],
        },
      },
      speakers: {
        type: "array",
        title: "Speakers",
        items: {
          type: "object",
          properties: { name: { type: "string", title: "Name" } },
        },
      },
    },
  },
});

function request(
  text: string,
  contract: AiContract = compileFillContract({ entity: fields }),
  signal = new AbortController().signal,
): MapoAiProviderRequest {
  const parts = [{ kind: "text" as const, text }];
  return {
    task: contract.task,
    model: "mock",
    prompt: composeMapoAiPrompt({ contract, parts }),
    parts,
    schema: contract.schema,
    contract,
    signal,
  };
}

/** The values the mock answers, by field key rather than property name. */
async function valuesOf(text: string): Promise<Record<string, unknown>> {
  const { mockProvider } = await mock();
  const asked = request(text);
  const answer = await mockProvider.run(asked);
  if (answer.status !== "answered" || asked.contract.task !== "fill")
    throw new Error("refused");
  const values = (answer.output as { values: Record<string, unknown> }).values;
  return Object.fromEntries(
    asked.contract.entity.fields.map((field) => [
      field.key,
      values[field.wire],
    ]),
  );
}

beforeEach(() => {
  vi.resetModules();
});

describe("the mock's rules", () => {
  it("fills a field from a line that names its label, its key or its property", async () => {
    const values = await valuesOf("Title: Tosca\nCITTA: Pisa");

    expect(values).toMatchObject({ title: "Tosca", città: "Pisa" });
  });

  it("answers every property of the schema, empty when no line names it", async () => {
    const values = await valuesOf("Nothing here");

    expect(values).toEqual({
      title: "",
      città: "",
      published: "",
      level: "",
      tags: [],
      speakers: [],
    });
  });

  it("quotes the line of each value", async () => {
    const { mockProvider } = await mock();
    const answer = await mockProvider.run(request("Title: Tosca"));

    expect(answer).toMatchObject({
      status: "answered",
      output: {
        evidence: [{ field: "title", quote: "Title: Tosca", where: "" }],
      },
    });
  });

  it("reads a choice by its label or its value, and leaves one it does not know", async () => {
    expect(await valuesOf("Level: Published")).toMatchObject({ level: "live" });
    expect(await valuesOf("Level: draft")).toMatchObject({ level: "draft" });
    expect(await valuesOf("Level: Archived")).toMatchObject({ level: "" });
  });

  it("reads yes and no, in English and in Italian", async () => {
    expect(await valuesOf("Published: sì")).toMatchObject({
      published: "true",
    });
    expect(await valuesOf("Published: No")).toMatchObject({
      published: "false",
    });
    expect(await valuesOf("Published: maybe")).toMatchObject({ published: "" });
  });

  it("splits a list of choices at commas and semicolons", async () => {
    expect(await valuesOf("Tags: Alpha, b; Gamma")).toMatchObject({
      tags: ["a", "b"],
    });
  });

  it("leaves the items of a repeater empty", async () => {
    expect(await valuesOf("Speakers: Anna")).toMatchObject({ speakers: [] });
  });

  it("extracts an item for each entity a line fills, linked fields as { record, item }", async () => {
    const events = buildAiEntity({
      fields: {
        type: "object",
        properties: {
          title: { type: "string", title: "Title" },
          place: { type: "relation", title: "Place", endpoint: "/api/places/" },
        },
      },
    });
    const places = buildAiEntity({
      fields: {
        type: "object",
        properties: { city: { type: "string", title: "City" } },
      },
    });
    const contract = compileExtractContract([
      { entity: events, type: "event" },
      { entity: places, type: "place", endpoint: "/api/places/" },
    ]);
    const { mockProvider } = await mock();

    const answer = await mockProvider.run(
      request("Title: Tosca\nPlace: Teatro Verdi", contract),
    );

    expect(answer).toMatchObject({
      status: "answered",
      output: {
        items: [
          {
            type: "event",
            ref: "event-1",
            values: {
              title: "Tosca",
              place: { record: "Teatro Verdi", item: "" },
            },
          },
        ],
      },
    });
  });

  it("reads its lines in a time that grows with the text, whatever the text holds", async () => {
    const started = performance.now();

    const values = await valuesOf(`x: b${" ".repeat(60_000)}c\nTitle: Tosca`);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(values).toMatchObject({ title: "Tosca" });
  });

  it("counts about four characters a token", async () => {
    const { mockProvider } = await mock();
    const asked = request("Title: Tosca");

    const answer = await mockProvider.run(asked);

    const read = asked.prompt.instructions.length + asked.prompt.input.length;
    expect(answer.usage.inputTokens).toBe(Math.ceil(read / 4));
  });
});

describe("the mock's failures on command", () => {
  it("refuses with #mock:refusal", async () => {
    const { mockProvider } = await mock();

    expect(await mockProvider.run(request("#mock:refusal"))).toMatchObject({
      status: "refused",
    });
  });

  it("writes text that is not JSON with #mock:invalid-json", async () => {
    const { mockProvider } = await mock();
    const answer = await mockProvider.run(request("#mock:invalid-json"));

    expect(answer.status === "answered" && typeof answer.output).toBe("string");
  });

  it("throws the provider's failures with #mock:rate-limit and #mock:unavailable", async () => {
    const { mockProvider } = await mock();

    await expect(
      mockProvider.run(request("#mock:rate-limit")),
    ).rejects.toMatchObject({ failure: "rate-limit", retryAfter: 30 });
    await expect(
      mockProvider.run(request("#mock:unavailable")),
    ).rejects.toMatchObject({ failure: "unavailable" });
  });

  it("never answers #mock:timeout until the gateway gives up", async () => {
    const { mockProvider } = await mock();
    const controller = new AbortController();
    const answer = mockProvider.run(
      request("#mock:timeout", undefined, controller.signal),
    );

    controller.abort(new Error("given up"));

    await expect(answer).rejects.toThrow("given up");
  });

  it("waits the seconds #mock:slow says, then answers, unless the gateway gives up", async () => {
    vi.useFakeTimers();
    try {
      const { mockProvider } = await mock();
      const slow = mockProvider.run(request("#mock:slow=2\nTitle: Tosca"));
      await vi.advanceTimersByTimeAsync(2000);
      expect(await slow).toMatchObject({ status: "answered" });

      const controller = new AbortController();
      const stopped = mockProvider.run(
        request("#mock:slow\nTitle: Tosca", undefined, controller.signal),
      );
      controller.abort(new Error("given up"));
      await expect(stopped).rejects.toThrow("given up");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the mock's fixtures", () => {
  it("answers the fixture a source names, and refuses a name it does not have", async () => {
    const { mockProvider, registerMapoAiMockFixtures } = await mock();
    registerMapoAiMockFixtures([
      {
        name: "tosca",
        answer: { values: { title: "Tosca" } },
        usage: { inputTokens: 7 },
      },
      { name: "no", refusal: "Not this one." },
    ]);

    expect(
      await mockProvider.run(request("#mock:fixture=tosca")),
    ).toMatchObject({
      status: "answered",
      output: { values: { title: "Tosca" } },
      usage: { inputTokens: 7 },
    });
    expect(await mockProvider.run(request("#mock:fixture=no"))).toEqual(
      expect.objectContaining({ status: "refused", refusal: "Not this one." }),
    );
    expect(
      await mockProvider.run(request("#mock:fixture=other")),
    ).toMatchObject({
      status: "refused",
      refusal: 'The mock has no fixture named "other".',
    });
  });

  it("answers the fixture whose source the text is, case and spaces aside", async () => {
    const { mockProvider, registerMapoAiMockFixtures } = await mock();
    registerMapoAiMockFixtures([
      {
        name: "text",
        source: "Tosca  al\nVerdi",
        answer: { values: { title: "T" } },
      },
    ]);

    expect(await mockProvider.run(request("tosca al verdi"))).toMatchObject({
      output: { values: { title: "T" } },
    });
    expect(await mockProvider.run(request("Title: Tosca"))).toMatchObject({
      output: { values: { title: "Tosca" } },
    });
  });

  it.each([
    ["a name that is not one", { name: "Tosca!", answer: {} }],
    ["neither an answer nor a refusal", { name: "tosca" }],
    [
      "both an answer and a refusal",
      { name: "tosca", answer: {}, refusal: "no" },
    ],
  ])("refuses a fixture with %s", async (_case, fixture) => {
    const { registerMapoAiMockFixtures } = await mock();

    expect(() => registerMapoAiMockFixtures([fixture])).toThrow(TypeError);
  });

  it("refuses a name registered already", async () => {
    const { registerMapoAiMockFixtures } = await mock();
    registerMapoAiMockFixtures([{ name: "tosca", answer: {} }]);

    expect(() =>
      registerMapoAiMockFixtures([{ name: "tosca", answer: {} }]),
    ).toThrow("registered already");
  });

  it("keeps an answer of undefined as an answer", async () => {
    const { mockProvider, registerMapoAiMockFixtures } = await mock();
    registerMapoAiMockFixtures([{ name: "nothing", answer: undefined }]);

    expect(
      await mockProvider.run(request("#mock:fixture=nothing")),
    ).toMatchObject({
      status: "answered",
    });
  });
});

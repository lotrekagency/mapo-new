import { describe, expect, it } from "vitest";

import {
  withDecimalLimits,
  withDecimalsAsNumbers,
  withExclusiveBounds,
} from "../jsonSchema/decimal.js";
import type { JSONSchema } from "../jsonSchema/index.js";

describe("withDecimalLimits", () => {
  it("writes the decimal places as a step and the whole digits as bounds", () => {
    expect(withDecimalLimits({ type: "number" }, 4, 2)).toEqual({
      type: "number",
      multipleOf: 0.01,
      exclusiveMinimum: -10000,
      exclusiveMaximum: 10000,
    });
    expect(withDecimalLimits({ type: "number" }, 0, 3)).toEqual({
      type: "number",
      multipleOf: 0.001,
      exclusiveMinimum: -1,
      exclusiveMaximum: 1,
    });
    expect(withDecimalLimits({ type: "number" }, undefined, 0)).toEqual({
      type: "number",
      multipleOf: 1,
    });
  });

  it("adds a bound only where no limit is as strict, and keeps the limits the form reads", () => {
    expect(
      withDecimalLimits({ type: "number", minimum: 0, maximum: 500 }, 4, 2),
    ).toEqual({ type: "number", minimum: 0, maximum: 500, multipleOf: 0.01 });
    expect(
      withDecimalLimits({ type: "number", minimum: -1e9, maximum: 1e9 }, 4, 2),
    ).toEqual({
      type: "number",
      minimum: -1e9,
      maximum: 1e9,
      multipleOf: 0.01,
      exclusiveMinimum: -10000,
      exclusiveMaximum: 10000,
    });
    // A maximum equal to the bound lets the bound itself in: the bound is added.
    expect(withDecimalLimits({ type: "number", maximum: 10000 }, 4, 2)).toEqual(
      {
        type: "number",
        maximum: 10000,
        multipleOf: 0.01,
        exclusiveMinimum: -10000,
        exclusiveMaximum: 10000,
      },
    );
  });

  it("does not take OpenAPI 3.0's flags for limits", () => {
    expect(
      withDecimalLimits(
        { type: "number", exclusiveMaximum: true } as unknown as JSONSchema,
        4,
        2,
      ),
    ).toEqual({
      type: "number",
      multipleOf: 0.01,
      exclusiveMinimum: -10000,
      exclusiveMaximum: 10000,
    });
  });

  it("keeps the step a schema has", () => {
    expect(
      withDecimalLimits({ type: "number", multipleOf: 0.05 }, undefined, 2),
    ).toEqual({ type: "number", multipleOf: 0.05 });
  });

  it("starts from zero for an unsigned decimal", () => {
    expect(withDecimalLimits({ type: "number" }, 2, 1, false)).toEqual({
      type: "number",
      multipleOf: 0.1,
      minimum: 0,
      exclusiveMaximum: 100,
    });
  });

  it("ignores counts that are not whole numbers from zero up", () => {
    expect(withDecimalLimits({ type: "number" }, -1, 1.5)).toEqual({
      type: "number",
    });
  });
});

describe("withDecimalsAsNumbers", () => {
  it("reads a decimal sent as a string as a number, keeping its limits", () => {
    expect(
      withDecimalsAsNumbers({
        type: "string",
        format: "decimal",
        minimum: 0,
        maximum: 1000,
        multipleOf: 0.01,
      }),
    ).toEqual({ type: "number", minimum: 0, maximum: 1000, multipleOf: 0.01 });
  });

  it("turns the pattern DRF-spectacular writes into limits", () => {
    expect(
      withDecimalsAsNumbers({
        type: ["string", "null"],
        format: "decimal",
        pattern: "^-?\\d{0,3}(?:\\,\\d{0,2})?$",
      }),
    ).toEqual({
      type: ["number", "null"],
      multipleOf: 0.01,
      exclusiveMinimum: -1000,
      exclusiveMaximum: 1000,
    });
    expect(
      withDecimalsAsNumbers({
        type: "string",
        format: "decimal",
        pattern: "^[0-9]+$",
      }),
    ).toEqual({ type: "number" });
  });

  it("reads OpenAPI 3.0's flags before it compares the limits", () => {
    expect(
      withDecimalsAsNumbers({
        type: "string",
        format: "decimal",
        maximum: 100,
        exclusiveMaximum: true,
        pattern: "^-?\\d{0,4}(?:\\.\\d{0,2})?$",
      } as unknown as JSONSchema),
    ).toEqual({
      type: "number",
      maximum: 100,
      exclusiveMaximum: 100,
      multipleOf: 0.01,
      exclusiveMinimum: -10000,
    });
  });

  it("names each type once", () => {
    expect(
      withDecimalsAsNumbers({ type: ["string", "number"], format: "decimal" }),
    ).toEqual({ type: ["number"] });
  });

  it("keeps what keeps the AI out on a decimal it reads", () => {
    expect(
      withDecimalsAsNumbers({
        type: "string",
        format: "decimal",
        readOnly: true,
        writeOnly: true,
        "x-mapo-ai": { exclude: true },
      }),
    ).toEqual({
      type: "number",
      readOnly: true,
      writeOnly: true,
      "x-mapo-ai": { exclude: true },
    });
  });

  it("finds decimals at any depth", () => {
    const decimal = { type: "string", format: "decimal" };
    const read = withDecimalsAsNumbers({
      type: "object",
      properties: {
        price: decimal,
        discount: { anyOf: [decimal, { type: "null" }] },
        lines: { type: "array", items: { $ref: "#/$defs/Line" } },
      },
      $defs: {
        Line: { type: "object", properties: { amount: decimal } },
      },
    });

    expect(read.properties?.price).toEqual({ type: "number" });
    expect(read.properties?.discount?.anyOf?.[0]).toEqual({ type: "number" });
    expect(read.$defs?.Line?.properties?.amount).toEqual({ type: "number" });
  });

  it("gives back the same schema when it has no decimal", () => {
    const schema = {
      type: "object",
      properties: { title: { type: "string" }, open: true },
      anyOf: [true, { type: "object" }],
    };

    expect(withDecimalsAsNumbers(schema)).toBe(schema);
  });
});

describe("withExclusiveBounds", () => {
  it("writes OpenAPI 3.0's bound flags as JSON Schema's bounds, keeping the inclusive ones", () => {
    expect(
      withExclusiveBounds({
        type: "number",
        maximum: 10000,
        minimum: -10000,
        exclusiveMaximum: true,
        exclusiveMinimum: false,
      } as never),
    ).toEqual({
      type: "number",
      maximum: 10000,
      exclusiveMaximum: 10000,
      minimum: -10000,
    });
  });

  it("leaves JSON Schema's bounds as they are", () => {
    expect(withExclusiveBounds({ exclusiveMaximum: 5, minimum: 1 })).toEqual({
      exclusiveMaximum: 5,
      minimum: 1,
    });
  });
});

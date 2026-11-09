/**
 * The body of `POST /_mapo/ai/run`, read as outside data: JSON only, up to
 * a size the limits allow, then checked with zod. The two JSON Schemas of
 * each entity are not checked here beyond being objects: the entity model
 * (`buildAiEntity()`) reads every part of them as outside data, and keeps
 * out what it cannot read.
 */

import type { JSONSchema } from "@mapomodule/utils";
import { createError } from "h3";
import type { H3Event } from "h3";
import { z } from "zod";
import { MAPO_AI_MAX_PARTS, MAPO_AI_MAX_PART_NAME } from "../../shared/gateway";
import type {
  MapoAiLimits,
  MapoAiRunEntity,
  MapoAiRunRequest,
} from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { readJsonBody } from "../body";

/** Bytes a body may have besides its source and instructions: the entities' schemas. */
export const RUN_BODY_BASE_BYTES = 2 * 1024 * 1024;
/** Parts of a source a request may send: the page checks the same bound. */
export const MAX_PARTS = MAPO_AI_MAX_PARTS;
/** Entities an extraction may ask for. */
export const MAX_ENTITIES = 20;

const SHORT = z.string().max(200);

/** An object, read as a JSON Schema by the entity model, which trusts none of its parts. */
const SCHEMA = z.custom<JSONSchema>((value) => isRecord(value), {
  message: "Expected a JSON Schema object",
});

const CHOICE = z.strictObject({
  value: z.union([z.string().max(500), z.number(), z.boolean()]),
  label: z.string().max(500),
});

const ENTITY = z.strictObject({
  schema: SCHEMA.optional(),
  fields: SCHEMA.optional(),
  exclude: z.array(z.string().max(300)).max(500).optional(),
  type: z.string().min(1).max(64).optional(),
  label: SHORT.optional(),
  description: z.string().max(2000).optional(),
  endpoint: z.string().max(500).optional(),
  // A key such as `__proto__` is dropped by zod's records, never assigned.
  relationChoices: z
    .record(z.string().max(300), z.array(CHOICE).max(250))
    .refine((choices) => Object.keys(choices).length <= 500, {
      message: "Too many relation fields",
    })
    .optional(),
  evidence: z.boolean().optional(),
  model: z.string().min(1).max(100).optional(),
}) satisfies z.ZodType<MapoAiRunEntity>;

const PART = z.strictObject({
  kind: z.literal("text"),
  text: z.string(),
  name: z.string().max(MAPO_AI_MAX_PART_NAME).optional(),
});

const COMMON = {
  language: z.string().min(1).max(35).optional(),
  parts: z.array(PART).min(1).max(MAX_PARTS),
  instructions: z.string().optional(),
  provider: z
    .strictObject({
      id: z.string().min(1).max(64).optional(),
      model: z.string().min(1).max(200).optional(),
    })
    .optional(),
};

const RUN_REQUEST = z.discriminatedUnion("task", [
  z.strictObject({
    task: z.literal("fill"),
    entity: ENTITY,
    existing: z.boolean().optional(),
    ...COMMON,
  }),
  z.strictObject({
    task: z.literal("extract"),
    entities: z.array(ENTITY).min(1).max(MAX_ENTITIES),
    ...COMMON,
  }),
]) satisfies z.ZodType<MapoAiRunRequest>;

/**
 * The most bytes a body may have under these limits: room for the
 * entities' schemas, and six bytes for each character of the source and of
 * the instructions, the most a character takes in JSON (`\u001f`).
 */
export function maxBodyBytes(limits: MapoAiLimits): number {
  return (
    RUN_BODY_BASE_BYTES +
    6 * (limits.maxSourceChars + limits.maxInstructionsChars)
  );
}

/**
 * Reads the request of `run`, or the error that refuses it:
 * - 415 when the body is not JSON by its `Content-Type`;
 * - 413 when it is larger than the limits allow, its source longer than
 *   `maxSourceChars` or its instructions longer than `maxInstructionsChars`;
 * - 400 when it is not a request of `run`: the first problem's path in the
 *   message, never a value.
 * @throws H3Error 400, 413 or 415
 */
export async function readRunRequest(
  event: H3Event,
  limits: MapoAiLimits,
): Promise<MapoAiRunRequest> {
  const body = await readJsonBody(event, maxBodyBytes(limits));
  const parsed = RUN_REQUEST.safeParse(body);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const path = issue?.path.length ? issue.path.join(".") : "body";
    // The message is fixed: what the request wrote, keys included, goes in
    // `data`, cut short.
    throw createError({
      statusCode: 400,
      statusMessage: "Not a request of run",
      data: {
        path: capped(path),
        problem: capped(issue?.message ?? "invalid"),
      },
    });
  }

  const request = parsed.data;
  checkEntities(request);
  const sourceChars = request.parts.reduce(
    (sum, part) => sum + part.text.length,
    0,
  );
  if (sourceChars > limits.maxSourceChars) {
    throw createError({
      statusCode: 413,
      statusMessage: `The source has more than ${limits.maxSourceChars} characters`,
    });
  }
  const instructionChars = request.instructions?.length ?? 0;
  if (instructionChars > limits.maxInstructionsChars) {
    throw createError({
      statusCode: 413,
      statusMessage:
        limits.maxInstructionsChars === 0
          ? "This app takes no instructions from the operator"
          : `The instructions have more than ${limits.maxInstructionsChars} characters`,
    });
  }
  return request;
}

/** Every entity has a description to read, and in an extraction a type of its own. */
function checkEntities(request: MapoAiRunRequest): void {
  const entities =
    request.task === "fill" ? [request.entity] : request.entities;
  const isDescribed = entities.every(
    (entity) => entity.schema !== undefined || entity.fields !== undefined,
  );
  if (!isDescribed) {
    throw createError({
      statusCode: 400,
      statusMessage: "Not a request of run",
      data: { problem: "an entity needs a schema or fields" },
    });
  }
  if (request.task === "fill") return;
  const types = request.entities.map((entity) => entity.type);
  const hasEveryType = types.every((type) => type !== undefined);
  const isUnique = new Set(types).size === types.length;
  if (!hasEveryType || !isUnique) {
    throw createError({
      statusCode: 400,
      statusMessage: "Not a request of run",
      data: { problem: "each entity of an extraction needs a type of its own" },
    });
  }
}

/** A text of the request, cut to what an error may repeat. */
export function capped(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * What the AI is asked, built by the gateway from what the page sends: the
 * two descriptions of each entity become its model (`buildAiEntity()`),
 * and the models a contract (`compileFillContract()`,
 * `compileExtractContract()`), with the same code the page runs. The rules
 * a contract holds inside, its property names, choices and templates,
 * hold because the gateway compiled it: a request can only send other
 * descriptions, which the entity model reads as outside data.
 */

import { createError, isError } from "h3";
import {
  compileExtractContract,
  compileFillContract,
} from "../../shared/contract";
import type { AiContract, AiContractSource } from "../../shared/contract";
import { buildAiEntity } from "../../shared/entity";
import type { MapoAiRunEntity, MapoAiRunRequest } from "../../shared/gateway";
import { capped } from "./request";

/**
 * The contract of a request of `run`. An extraction leaves out the entities
 * the AI may fill nothing of.
 * @throws H3Error 422 when the AI may fill nothing, or the contract cannot
 *   be compiled: entities that share an endpoint, a schema too large for
 *   the providers
 */
export function contractOf(request: MapoAiRunRequest): AiContract {
  try {
    if (request.task === "fill") {
      const source = sourceOf(request.entity);
      if (!source.entity.fields.length) throw nothingToFill();
      return compileFillContract(source, languageOf(request));
    }
    const sources = request.entities
      .map(sourceOf)
      .filter((source) => source.entity.fields.length > 0);
    if (!sources.length) throw nothingToFill();
    return compileExtractContract(sources, languageOf(request));
  } catch (error) {
    if (isError(error)) throw error;
    // The compiler's messages name limits and keys, never values.
    const message =
      error instanceof RangeError
        ? "an entity's description is too deeply nested to read"
        : error instanceof Error
          ? error.message
          : String(error);
    throw createError({
      statusCode: 422,
      statusMessage: "The AI cannot be asked",
      data: { problem: capped(message) },
    });
  }
}

function sourceOf(entity: MapoAiRunEntity): AiContractSource {
  const model = buildAiEntity(
    {
      ...(entity.schema ? { schema: entity.schema } : {}),
      ...(entity.fields ? { fields: entity.fields } : {}),
    },
    entity.exclude ? { exclude: entity.exclude } : {},
  );
  return {
    entity: model,
    ...(entity.type !== undefined ? { type: entity.type } : {}),
    ...(entity.label !== undefined ? { label: entity.label } : {}),
    ...(entity.description !== undefined
      ? { description: entity.description }
      : {}),
    ...(entity.endpoint !== undefined ? { endpoint: entity.endpoint } : {}),
    ...(entity.relationChoices
      ? { relationChoices: entity.relationChoices }
      : {}),
    ...(entity.evidence !== undefined ? { evidence: entity.evidence } : {}),
  };
}

function languageOf(request: MapoAiRunRequest): { language?: string } {
  return request.language ? { language: request.language } : {};
}

function nothingToFill() {
  return createError({
    statusCode: 422,
    statusMessage: "The AI may fill no field of this entity",
  });
}

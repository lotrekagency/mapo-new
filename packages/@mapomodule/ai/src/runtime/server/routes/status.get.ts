import { defineEventHandler } from "h3";
import { MAPO_AI_CONTRACT_VERSION } from "../../shared/gateway";
import type { MapoAiStatus } from "../../shared/gateway";

/**
 * `GET /_mapo/ai/status`: what the gateway offers. Every caller gets the same
 * answer, the contract version, so it carries no configuration and no user
 * data.
 */
export default defineEventHandler(
  (): MapoAiStatus => ({ contract: MAPO_AI_CONTRACT_VERSION }),
);

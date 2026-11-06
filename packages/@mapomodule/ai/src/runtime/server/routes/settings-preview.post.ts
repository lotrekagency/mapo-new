import { createError, defineEventHandler, setResponseHeader } from "h3";
import { z } from "zod";
import type { MapoAiPreviewResponse } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { readJsonBody } from "../body";
import { previewMapoAiRules } from "../prompts/compose";
import { mapoAiAdminSettings, mapoAiRunOptions } from "../run/nitro";
import { MAX_ADMIN_INSTRUCTIONS, SETTINGS_BODY_BYTES } from "../settings/admin";

const INSTRUCTION = z.string().max(MAX_ADMIN_INSTRUCTIONS).optional();
const INPUT = z.strictObject({
  task: z.enum(["fill", "extract"]),
  instructions: z
    .strictObject({
      all: INSTRUCTION,
      fill: INSTRUCTION,
      extract: INSTRUCTION,
    })
    .optional(),
});

/**
 * `POST /_mapo/ai/settings/preview`, for the AI's admins: the rules the
 * model reads for a task, layers 1–3 of its prompt (Mapo's, the app's,
 * the admins'), with the instructions the body holds, not saved yet, or
 * the saved ones. Without the record, the source and what the app's
 * `mapo-ai:prompt` hooks add for a request. It calls no model.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiPreviewResponse> => {
    setResponseHeader(event, "cache-control", "no-store");
    await requireMapoAiAdmin(event);
    const parsed = INPUT.safeParse(
      await readJsonBody(event, SETTINGS_BODY_BYTES),
    );
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a preview of the AI's rules",
      });
    }
    const { task, instructions } = parsed.data;
    const app = mapoAiRunOptions(event).instructions;
    const admin = instructions
      ? {
          all: instructions.all ?? "",
          fill: instructions.fill ?? "",
          extract: instructions.extract ?? "",
        }
      : (await mapoAiAdminSettings(event)).instructions;
    return previewMapoAiRules(
      task,
      [app.all, app[task]],
      [admin.all, admin[task]],
    );
  },
);

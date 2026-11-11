/**
 * Runs a case of the evaluation through the chain a page uses, with no
 * server: the source read by Mapo's readers, `runMapoAiFill()` with the
 * gateway's `run` route served in this process (the prompt, the provider,
 * the checks of the answer) and the backend's records for the relations,
 * and the answer planned for the record as it was. The caller mocks
 * `nitropack/runtime` with `./nitro`, which the route reads.
 */
import { createApp, createRouter, toWebHandler } from "h3";
import { readSourceFile } from "../src/runtime/server/readers/read";
import { mapoAiReaders } from "../src/runtime/server/readers/registry";
import {
  dataOf,
  isItemHeld,
  readModelValue,
  runMapoAiFill,
} from "../src/runtime/shared/fill";
import type {
  MapoAiFillAnswer,
  MapoAiFillDependencies,
} from "../src/runtime/shared/fill";
import { MAPO_AI_GATEWAY_PATH } from "../src/runtime/shared/gateway";
import type { MapoAiSourcePart } from "../src/runtime/shared/gateway";
import { isRecord } from "../src/runtime/shared/guards";
import { holdsRelationId, relationIdOf } from "../src/runtime/shared/relations";
import { evalBackendGet } from "./backend";
import type { EvalCase, EvalSource } from "./case";
import { EVAL_FORMS } from "./forms";

/** The characters `run` takes by default, all the parts together. */
const MAX_SOURCE_CHARS = 100_000;

/** What became of a case: the answer, or why there is none, and how long it took. */
export interface EvalRun {
  case: EvalCase;
  /** Milliseconds from the request to the plan of the answer. */
  ms: number;
  answer?: MapoAiFillAnswer;
  /** Why the call failed, as the gateway says it: never a key. */
  error?: string;
}

/** `post` of the browser. */
export type EvalPost = MapoAiFillDependencies["post"];

/** The source as the parts `run` takes: a text, or a file read by Mapo's readers. */
export async function sourcePartsOf(
  source: EvalSource,
): Promise<MapoAiSourcePart[]> {
  if (source.kind === "text") return [{ kind: "text", text: source.text }];
  const read = await readSourceFile(
    {
      name: source.name,
      type: "",
      bytes: new TextEncoder().encode(source.content),
    },
    {
      readers: mapoAiReaders(),
      isOn: () => true,
      maxChars: MAX_SOURCE_CHARS,
      touchUp: async ({ parts }) => parts,
    },
  );
  if (read.status !== "read") {
    throw new Error(`${source.name} was not read: ${read.status}`);
  }
  return read.parts;
}

/**
 * `post` of the browser, served by the gateway's `run` route in this
 * process, for a signed-in user the backend knows.
 */
export async function gatewayPost(): Promise<EvalPost> {
  const route = (await import("../src/runtime/server/routes/run.post")).default;
  const router = createRouter().post(`${MAPO_AI_GATEWAY_PATH}/run`, route);
  const handle = toWebHandler(createApp().use(router));
  return async (path, body, { signal }) => {
    const response = await handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "sessionid=evaluation",
        },
        body: JSON.stringify(body),
        signal,
      }),
    );
    const answer: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw Object.assign(new Error(`run answered ${response.status}`), {
        statusCode: response.status,
        data: answer,
      });
    }
    return answer;
  };
}

/**
 * Runs a case. With the mock, a first part names the case's fixture, so
 * the mock gives the case's own answer; a model reads the source alone.
 */
export async function runEvalCase(
  evalCase: EvalCase,
  options: { post: EvalPost; mock: boolean },
): Promise<EvalRun> {
  const form = EVAL_FORMS[evalCase.form];
  const record = structuredClone(evalCase.record ?? {});
  const parts = await sourcePartsOf(evalCase.source);
  const fixture: MapoAiSourcePart = {
    kind: "text",
    text: `#mock:fixture=${evalCase.id}`,
  };
  const keys = new Set(form.fields.map((field) => field.key as string));
  const translatable = new Set(
    form.fields
      .filter((field) => field.translatable)
      .map((field) => field.key as string),
  );
  const pathOf = (key: string): string | undefined => {
    if (!keys.has(key)) return undefined;
    const isTranslated = translatable.has(key);
    return isTranslated ? `translations.${evalCase.language}.${key}` : key;
  };
  // Whether the record holds the AI's value already, as the page reads it:
  // a related record by its id, a list's items each, any other value as data.
  const holds = (key: string, value: unknown): boolean => {
    const path = pathOf(key);
    if (path === undefined) return false;
    const held = readModelValue(record, path);
    const field = form.fields.find((one) => one.key === key);
    const declared: unknown = field ? Reflect.get(field, "attrs") : undefined;
    const attrs = isRecord(declared) ? declared : {};
    const isRelation = field?.type === "fks" || field?.type === "m2m";
    if (isRelation) {
      const itemValue =
        typeof attrs.itemValue === "string" ? attrs.itemValue : "id";
      const proposed: unknown[] = Array.isArray(value) ? value : [value];
      const ids = proposed.map((one) => relationIdOf(one, itemValue));
      return (
        ids.length > 0 &&
        ids.every(
          (id) => id !== undefined && holdsRelationId(held, id, itemValue),
        )
      );
    }
    const isItems =
      Array.isArray(value) && value.length > 0 && value.every(isRecord);
    if (isItems) return value.every((item) => isItemHeld(item, held));
    const data = dataOf(value);
    return data !== undefined && dataOf(held) === data;
  };
  const started = performance.now();
  try {
    const answer = await runMapoAiFill(
      {
        fields: form.fields,
        source: options.mock ? [fixture, ...parts] : parts,
        existing: evalCase.record !== undefined,
        language: evalCase.language,
        ...(evalCase.instructions
          ? { instructions: evalCase.instructions }
          : {}),
        entity: { label: form.label },
        form: {
          pathOf,
          read: (path) => readModelValue(record, path),
          holds,
        },
      },
      { post: options.post, get: (path) => evalBackendGet(path) },
    );
    return { case: evalCase, ms: performance.now() - started, answer };
  } catch (error) {
    return {
      case: evalCase,
      ms: performance.now() - started,
      error: failureText(error),
    };
  }
}

/** A failure as the report says it: the gateway's status and words. */
function failureText(error: unknown): string {
  if (!isRecord(error)) return String(error);
  const data = isRecord(error.data) ? error.data : {};
  const words =
    typeof data.statusMessage === "string" ? data.statusMessage : undefined;
  const message = error instanceof Error ? error.message : "failed";
  return words ? `${message}: ${words}` : message;
}

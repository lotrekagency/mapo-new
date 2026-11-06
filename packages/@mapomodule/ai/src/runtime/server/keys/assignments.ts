/**
 * The keys an admin assigns, as the gateway keeps them: one sealed record,
 * `assignments` in the storage's `keys` purpose, holding every assignment
 * and the order of the groups, so a change is one write and a reader never
 * sees half of one. The bodies of the routes that change it are read here
 * too, as outside data.
 *
 * Pure: the record is read and changed as data; `store.ts` keeps it.
 */

import { createError } from "h3";
import { z } from "zod";
import type {
  MapoAiKeyAssignment,
  MapoAiKeyAssignmentInput,
  MapoAiKeyScope,
  MapoAiTokenInput,
} from "../../shared/gateway";

/** The record's name in the `keys` purpose. */
export const KEYS_RECORD = "assignments";
/** Assignments the record holds at most. */
export const MAX_ASSIGNMENTS = 500;
/** Groups the order names at most. */
export const MAX_GROUPS = 500;
/** Characters of a group's name or a user's id. */
const MAX_NAME = 150;
/** Characters of a key or a token. */
export const MAX_KEY = 4096;
/** Models an assignment names at most. */
const MAX_MODELS = 100;
const MAX_MODEL_ID = 200;
/** A provider's id: lowercase letters, digits and `-`, starting with a letter. */
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,63}$/;
/**
 * The shortest key whose last four characters are shown: for a shorter
 * one, four characters would tell too much of it.
 */
const MIN_KEY_SHOWN = 16;

/** An assignment as the record keeps it: with its key. */
export interface StoredAssignment {
  id: string;
  scope: MapoAiKeyScope;
  provider: string;
  models?: string[];
  key?: string;
  personalTokens: boolean;
  updated: { at: string; by: { id: string; username?: string } };
}

/** The record of the admins' keys. */
export interface KeysRecord {
  v: 1;
  assignments: StoredAssignment[];
  /** The groups in order of priority, highest first. */
  groups: string[];
}

/** What the record holds before an admin assigns anything. */
export function emptyKeysRecord(): KeysRecord {
  return { v: 1, assignments: [], groups: [] };
}

/** A provider the app enables, as an assignment is checked against it. */
export interface AssignableProvider {
  id: string;
  /** The models the app enables, its default first. */
  models: readonly string[];
  /** Whether its calls take a key; absent: it uses none. */
  key?: "required" | "optional";
}

/** Who makes a change: the admin, or the user saving their token. */
export interface KeyActor {
  id: string;
  username?: string;
}

/**
 * A key or a token as the gateway takes it: printable characters without
 * spaces, since it goes into a header, where a line break would end it.
 */
const KEY_TEXT = z
  .string()
  .min(1)
  .max(MAX_KEY)
  .regex(/^[\x21-\x7e]+$/, "printable ASCII without spaces");
/** A group's name or a user's id: one line of text, without blanks around. */
const NAME = z
  .string()
  .min(1)
  .max(MAX_NAME)
  .refine(
    (name) => name === name.trim() && !/\p{Cc}/u.test(name),
    "one line, without blanks around",
  );
const PROVIDER = z.string().regex(PROVIDER_ID);
const MODEL = z.string().min(1).max(MAX_MODEL_ID);

const SCOPE = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("all") }),
  z.strictObject({ kind: z.literal("group"), group: NAME }),
  z.strictObject({ kind: z.literal("user"), user: NAME }),
]);

const ACTOR = z.strictObject({
  id: z.string().min(1).max(MAX_NAME),
  username: z.string().max(MAX_NAME).optional(),
});

const STORED = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/),
  scope: SCOPE,
  provider: PROVIDER,
  models: z.array(MODEL).max(MAX_MODELS).optional(),
  key: KEY_TEXT.optional(),
  personalTokens: z.boolean(),
  updated: z.strictObject({ at: z.string().max(40), by: ACTOR }),
});

const RECORD = z.strictObject({
  v: z.literal(1),
  assignments: z.array(STORED).max(MAX_ASSIGNMENTS),
  groups: z.array(NAME).max(MAX_GROUPS),
});

const ASSIGNMENT_INPUT = z.strictObject({
  scope: SCOPE,
  provider: PROVIDER,
  models: z.array(MODEL).max(MAX_MODELS).nullable().optional(),
  key: KEY_TEXT.nullable().optional(),
  personalTokens: z.boolean().optional(),
});

const GROUPS_INPUT = z.strictObject({
  groups: z.array(NAME).max(MAX_GROUPS),
});

const TOKEN_INPUT = z.strictObject({
  provider: PROVIDER,
  token: KEY_TEXT,
});

const TOKEN_REMOVAL = z.object({
  provider: PROVIDER,
  user: NAME.optional(),
});

/**
 * The record read back from the storage, or `undefined` when it is not one
 * this version writes.
 * @param value the stored value: outside data
 */
export function readKeysRecord(value: unknown): KeysRecord | undefined {
  const parsed = RECORD.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The body of `PUT /_mapo/ai/keys`.
 * @param value the body: outside data
 * @throws H3Error 400, saying where the body is wrong, never what it holds
 */
export function readAssignmentInput(value: unknown): MapoAiKeyAssignmentInput {
  return parsedOrRefused(ASSIGNMENT_INPUT, value, "Not an assignment of a key");
}

/**
 * The body of `PUT /_mapo/ai/keys/groups`: the groups in order of priority,
 * each once.
 * @param value the body: outside data
 * @throws H3Error 400
 */
export function readGroupsInput(value: unknown): string[] {
  const { groups } = parsedOrRefused(
    GROUPS_INPUT,
    value,
    "Not an order of groups",
  );
  if (new Set(groups).size !== groups.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Not an order of groups",
      data: { path: "groups", problem: "a group is named twice" },
    });
  }
  return groups;
}

/**
 * The body of `PUT /_mapo/ai/token`.
 * @param value the body: outside data
 * @throws H3Error 400
 */
export function readTokenInput(value: unknown): MapoAiTokenInput {
  return parsedOrRefused(TOKEN_INPUT, value, "Not a token");
}

/**
 * The query of `DELETE /_mapo/ai/token`: the provider, and the user whose
 * token an admin removes.
 * @param value the query: outside data
 * @throws H3Error 400
 */
export function readTokenRemoval(value: unknown): {
  provider: string;
  user?: string;
} {
  return parsedOrRefused(TOKEN_REMOVAL, value, "Not a token to remove");
}

/**
 * The record with `input` saved: it replaces the assignment of the same
 * scope and provider, keeping what the input leaves out, or it is added.
 * @param providers the providers the app enables
 * @param newId the id of an assignment that is added
 * @throws H3Error 400 when the app does not enable the provider or one of
 *   the models, or when a provider that uses no key is given a key or
 *   personal tokens; 409 when the record is full
 */
export function withAssignment(
  record: KeysRecord,
  input: MapoAiKeyAssignmentInput,
  context: {
    providers: readonly AssignableProvider[];
    by: KeyActor;
    at: string;
    newId: () => string;
  },
): {
  record: KeysRecord;
  assignment: StoredAssignment;
  /** Whether the key changed: set, replaced or removed. */
  keyChanged: boolean;
} {
  const provider = context.providers.find((one) => one.id === input.provider);
  if (!provider) refuse("provider", "the app does not enable this provider");
  const index = record.assignments.findIndex(
    (one) =>
      one.provider === input.provider && isSameScope(one.scope, input.scope),
  );
  const current = index >= 0 ? record.assignments[index] : undefined;
  if (!current && record.assignments.length >= MAX_ASSIGNMENTS) {
    throw createError({
      statusCode: 409,
      statusMessage: `There are ${MAX_ASSIGNMENTS} assignments already`,
    });
  }

  const models =
    input.models === undefined
      ? current?.models
      : (modelsOf(input.models, provider) ?? undefined);
  const key = input.key === undefined ? current?.key : (input.key ?? undefined);
  const personalTokens =
    input.personalTokens ?? current?.personalTokens ?? false;
  const takesNoKey = provider.key === undefined;
  if (takesNoKey && key !== undefined) {
    refuse("key", "this provider uses no key");
  }
  if (takesNoKey && personalTokens) {
    refuse("personalTokens", "this provider uses no key");
  }

  const assignment: StoredAssignment = {
    id: current?.id ?? context.newId(),
    scope: input.scope,
    provider: input.provider,
    ...(models ? { models } : {}),
    ...(key !== undefined ? { key } : {}),
    personalTokens,
    updated: { at: context.at, by: actorOf(context.by) },
  };
  const assignments = [...record.assignments];
  if (current) assignments[index] = assignment;
  else assignments.push(assignment);
  return {
    record: { ...record, assignments },
    assignment,
    keyChanged: current?.key !== key,
  };
}

/** The record without the assignment `id`; `undefined` when it has none. */
export function withoutAssignment(
  record: KeysRecord,
  id: string,
): { record: KeysRecord; removed: StoredAssignment } | undefined {
  const removed = record.assignments.find((one) => one.id === id);
  if (!removed) return undefined;
  const assignments = record.assignments.filter((one) => one.id !== id);
  return { record: { ...record, assignments }, removed };
}

/** An assignment as the admins see it: the key's last four characters, never the key. */
export function assignmentView(
  assignment: StoredAssignment,
): MapoAiKeyAssignment {
  const shown =
    assignment.key === undefined ? undefined : last4(assignment.key);
  return {
    id: assignment.id,
    scope: { ...assignment.scope },
    provider: assignment.provider,
    ...(assignment.models ? { models: [...assignment.models] } : {}),
    ...(assignment.key !== undefined
      ? { key: shown ? { last4: shown } : {} }
      : {}),
    personalTokens: assignment.personalTokens,
    updated: {
      at: assignment.updated.at,
      by: { ...assignment.updated.by },
    },
  };
}

/**
 * A key's last four characters, to tell keys apart; `undefined` for a key
 * shorter than 16 characters, of which four would tell too much.
 */
export function last4(key: string): string | undefined {
  return key.length >= MIN_KEY_SHOWN ? key.slice(-4) : undefined;
}

/** A new assignment's id: 16 random hexadecimal digits. */
export function newAssignmentId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Whether two scopes are the same: the same kind, for the same group or user. */
export function isSameScope(a: MapoAiKeyScope, b: MapoAiKeyScope): boolean {
  if (a.kind === "all" || b.kind === "all") return a.kind === b.kind;
  if (a.kind === "group") return b.kind === "group" && a.group === b.group;
  return b.kind === "user" && a.user === b.user;
}

/**
 * The models of an input, in the app's order; `null` for every model.
 * @throws H3Error 400 for a model the app does not enable, or one named twice
 */
function modelsOf(
  models: readonly string[] | null,
  provider: AssignableProvider,
): string[] | null {
  if (models === null) return null;
  if (new Set(models).size !== models.length) {
    refuse("models", "a model is named twice");
  }
  const isEnabled = models.every((model) => provider.models.includes(model));
  if (!isEnabled) refuse("models", "the app does not enable this model");
  return provider.models.filter((model) => models.includes(model));
}

function actorOf(by: KeyActor): KeyActor {
  return {
    id: by.id.slice(0, MAX_NAME),
    ...(by.username !== undefined
      ? { username: by.username.slice(0, MAX_NAME) }
      : {}),
  };
}

/**
 * The value `schema` reads, or a 400 with a fixed message: what the body
 * wrote, keys included, never goes back in the answer.
 */
function parsedOrRefused<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const [issue] = parsed.error.issues;
  const path = issue?.path.length ? issue.path.join(".") : "body";
  throw createError({
    statusCode: 400,
    statusMessage: message,
    data: { path: path.slice(0, 200), problem: problemOf(issue) },
  });
}

/**
 * What is wrong, in zod's words for the shape; for a key, never zod's
 * message, which may quote the value.
 */
function problemOf(
  issue: { path: readonly PropertyKey[]; message: string } | undefined,
): string {
  if (!issue) return "invalid";
  const isSecret = issue.path.some(
    (part) => part === "key" || part === "token",
  );
  if (isSecret) return "a key is printable characters without spaces";
  return issue.message.slice(0, 200);
}

/** @throws H3Error 400 about the field at `path` */
function refuse(path: string, problem: string): never {
  throw createError({
    statusCode: 400,
    statusMessage: "Not an assignment of a key",
    data: { path, problem },
  });
}

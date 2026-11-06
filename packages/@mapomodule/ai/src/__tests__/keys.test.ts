import { describe, expect, it } from "vitest";
import {
  assignmentView,
  emptyKeysRecord,
  last4,
  readAssignmentInput,
  readGroupsInput,
  readKeysRecord,
  readTokenInput,
  readTokenRemoval,
  withAssignment,
  withoutAssignment,
} from "../runtime/server/keys/assignments";
import type {
  AssignableProvider,
  KeysRecord,
  StoredAssignment,
} from "../runtime/server/keys/assignments";
import {
  applyingAssignments,
  keyStatusOf,
  providerAccess,
} from "../runtime/server/keys/chain";
import type {
  MapoAiKeyAssignmentInput,
  MapoAiKeyScope,
} from "../runtime/shared/gateway";

const OPENAI: AssignableProvider = {
  id: "openai",
  models: ["gpt-6.1-sol", "gpt-6-luna"],
  key: "required",
};
const OLLAMA: AssignableProvider = {
  id: "ollama",
  models: ["qwen3.8:27b", "gemma4:12b"],
  key: "optional",
};
const MOCK: AssignableProvider = { id: "mock", models: ["mock", "mock-large"] };

const PROJECT_KEY = "sk-project-0000000000000000PRJ1";
const ALL_KEY = "sk-all-000000000000000000000ALL1";
const GROUP_KEY = "sk-group-editors-0000000000EDT1";
const OTHER_GROUP_KEY = "sk-group-reporters-00000000REP1";
const USER_KEY = "sk-user-0000000000000000000USR1";
const TOKEN = "sk-personal-00000000000000TOK1";

const WRITER = { id: "4", groups: ["editors", "reporters"] };
const BY = { id: "1", username: "admin" };
const AT = "2026-11-06T10:00:00.000Z";

let made = 0;

function assignment(
  scope: MapoAiKeyScope,
  extra: Partial<StoredAssignment> = {},
): StoredAssignment {
  made += 1;
  return {
    id: made.toString(16).padStart(16, "0"),
    scope,
    provider: "openai",
    personalTokens: false,
    updated: { at: AT, by: BY },
    ...extra,
  };
}

function recordOf(
  assignments: StoredAssignment[],
  groups: string[] = [],
): KeysRecord {
  return { v: 1, assignments, groups };
}

const ALL: MapoAiKeyScope = { kind: "all" };
const EDITORS: MapoAiKeyScope = { kind: "group", group: "editors" };
const REPORTERS: MapoAiKeyScope = { kind: "group", group: "reporters" };
const WRITER_SCOPE: MapoAiKeyScope = { kind: "user", user: "4" };

describe("the chain of keys", () => {
  it("gives every model the app enables and the project's key when no admin assigned anything", () => {
    const access = providerAccess({
      provider: OPENAI,
      user: WRITER,
      record: emptyKeysRecord(),
      projectKey: PROJECT_KEY,
    });

    expect(access).toEqual({
      models: ["gpt-6.1-sol", "gpt-6-luna"],
      personalTokens: false,
      key: { level: "project", value: PROJECT_KEY },
    });
  });

  it("has no key when no level has one", () => {
    const access = providerAccess({
      provider: OPENAI,
      user: WRITER,
      record: emptyKeysRecord(),
    });

    expect(access.key).toBeUndefined();
    expect(keyStatusOf(OPENAI, access, undefined)).toEqual({
      level: "none",
      required: true,
      personal: { allowed: false, saved: false },
    });
  });

  it("climbs from the user to their groups to everyone, before the project", () => {
    const all = assignment(ALL, { key: ALL_KEY });
    const editors = assignment(EDITORS, { key: GROUP_KEY });
    const mine = assignment(WRITER_SCOPE, { key: USER_KEY });
    const access = (assignments: StoredAssignment[]) =>
      providerAccess({
        provider: OPENAI,
        user: WRITER,
        record: recordOf(assignments),
        projectKey: PROJECT_KEY,
      }).key;

    expect(access([all])).toEqual({ level: "all", value: ALL_KEY });
    expect(access([all, editors])).toEqual({
      level: "group",
      group: "editors",
      value: GROUP_KEY,
    });
    expect(access([all, editors, mine])).toEqual({
      level: "user",
      value: USER_KEY,
    });
  });

  it("takes the key of the group the admins put higher, whatever the record's order", () => {
    const editors = assignment(EDITORS, { key: GROUP_KEY });
    const reporters = assignment(REPORTERS, { key: OTHER_GROUP_KEY });
    const keyOf = (order: string[]) =>
      providerAccess({
        provider: OPENAI,
        user: WRITER,
        record: recordOf([editors, reporters], order),
      }).key;

    expect(keyOf(["reporters", "editors"])).toMatchObject({
      group: "reporters",
      value: OTHER_GROUP_KEY,
    });
    expect(keyOf(["editors", "reporters"])).toMatchObject({
      group: "editors",
    });
    // Groups the order leaves out come after those it names, by name.
    expect(keyOf(["reporters"])).toMatchObject({ group: "reporters" });
    expect(keyOf([])).toMatchObject({ group: "editors" });
    expect(
      providerAccess({
        provider: OPENAI,
        user: WRITER,
        record: recordOf([reporters, editors], []),
      }).key,
    ).toMatchObject({ group: "editors" });
  });

  it("lets the nearest assignment decide the models, and finds the key further up", () => {
    const editors = assignment(EDITORS, {
      models: ["gpt-6-luna"],
      personalTokens: true,
    });
    const all = assignment(ALL, { key: ALL_KEY });

    const access = providerAccess({
      provider: OPENAI,
      user: WRITER,
      record: recordOf([all, editors]),
    });

    expect(access).toEqual({
      models: ["gpt-6-luna"],
      personalTokens: true,
      key: { level: "all", value: ALL_KEY },
    });
  });

  it("keeps the app's order of the models, and drops those the app no longer enables", () => {
    const editors = assignment(EDITORS, {
      models: ["gpt-6-luna", "gpt-5", "gpt-6.1-sol"],
    });

    const access = providerAccess({
      provider: OPENAI,
      user: WRITER,
      record: recordOf([editors]),
    });

    expect(access.models).toEqual(["gpt-6.1-sol", "gpt-6-luna"]);
  });

  it("closes the provider to a scope whose assignment allows no model", () => {
    const all = assignment(ALL, { key: ALL_KEY });
    const editors = assignment(EDITORS, { models: [] });

    const access = providerAccess({
      provider: OPENAI,
      user: WRITER,
      record: recordOf([all, editors]),
    });

    expect(access.models).toEqual([]);
  });

  it("uses the user's own token only where the nearest assignment allows it", () => {
    const allowing = assignment(EDITORS, { personalTokens: true });
    const forbidding = assignment(WRITER_SCOPE, {
      key: USER_KEY,
      personalTokens: false,
    });
    const keyOf = (assignments: StoredAssignment[], token?: string) =>
      providerAccess({
        provider: OPENAI,
        user: WRITER,
        record: recordOf(assignments),
        projectKey: PROJECT_KEY,
        ...(token ? { token } : {}),
      }).key;

    expect(keyOf([allowing], TOKEN)).toEqual({
      level: "personal",
      value: TOKEN,
    });
    // Allowed, and none saved: the next level's key.
    expect(keyOf([allowing])).toEqual({ level: "project", value: PROJECT_KEY });
    // The nearest forbids it, though a group further up allows it.
    expect(keyOf([allowing, forbidding], TOKEN)).toEqual({
      level: "user",
      value: USER_KEY,
    });
    // No assignment: personal tokens are off.
    expect(keyOf([], TOKEN)).toEqual({ level: "project", value: PROJECT_KEY });
  });

  it("tells a saved token that is not allowed, and never uses it", () => {
    const access = providerAccess({
      provider: OPENAI,
      user: WRITER,
      record: recordOf([assignment(ALL, { key: ALL_KEY })]),
      token: TOKEN,
    });

    expect(keyStatusOf(OPENAI, access, TOKEN)).toEqual({
      level: "all",
      last4: "ALL1",
      required: true,
      personal: { allowed: false, saved: true, last4: "TOK1" },
    });
  });

  it("gives a provider that uses no key models only, whatever an assignment says", () => {
    const record = recordOf([
      assignment(ALL, {
        provider: "mock",
        models: ["mock-large"],
        key: ALL_KEY,
        personalTokens: true,
      }),
    ]);

    const access = providerAccess({
      provider: MOCK,
      user: WRITER,
      record,
      token: TOKEN,
      projectKey: PROJECT_KEY,
    });

    expect(access).toEqual({ models: ["mock-large"], personalTokens: false });
    expect(keyStatusOf(MOCK, access, TOKEN)).toBeUndefined();
  });

  it("says a server that takes calls without a key needs none", () => {
    const access = providerAccess({
      provider: OLLAMA,
      user: WRITER,
      record: emptyKeysRecord(),
    });

    expect(keyStatusOf(OLLAMA, access, undefined)).toMatchObject({
      level: "none",
      required: false,
    });
  });

  it("reads only the assignments of the provider asked", () => {
    const record = recordOf([
      assignment(ALL, { provider: "anthropic", key: ALL_KEY }),
      assignment(EDITORS, { key: GROUP_KEY }),
    ]);

    expect(
      applyingAssignments(record, "openai", WRITER).map((one) => one.scope),
    ).toEqual([EDITORS]);
  });

  it("matches a user by the backend's id, and a group by its name", () => {
    const record = recordOf([
      assignment({ kind: "user", user: "40" }, { key: USER_KEY }),
      assignment({ kind: "group", group: "Editors" }, { key: GROUP_KEY }),
    ]);

    expect(applyingAssignments(record, "openai", WRITER)).toEqual([]);
  });
});

describe("the last four characters of a key", () => {
  it("are shown for a key of 16 characters or more, never for a shorter one", () => {
    expect(last4("sk-0123456789abcdef")).toBe("cdef");
    expect(last4("0123456789abcdef")).toBe("cdef");
    expect(last4("0123456789abcde")).toBeUndefined();
  });
});

describe("an admin's assignment", () => {
  const providers = [OPENAI, OLLAMA, MOCK];
  const context = {
    providers,
    by: BY,
    at: AT,
    newId: () => "00000000000000a1",
  };

  it("is added with personal tokens off, and answered without its key", () => {
    const saved = withAssignment(
      emptyKeysRecord(),
      { scope: EDITORS, provider: "openai", key: GROUP_KEY },
      context,
    );

    expect(saved.assignment).toEqual({
      id: "00000000000000a1",
      scope: EDITORS,
      provider: "openai",
      key: GROUP_KEY,
      personalTokens: false,
      updated: { at: AT, by: BY },
    });
    expect(saved.keyChanged).toBe(true);
    expect(saved.record.assignments).toEqual([saved.assignment]);
    const view = assignmentView(saved.assignment);
    expect(view.key).toEqual({ last4: "EDT1" });
    expect(JSON.stringify(view)).not.toContain(GROUP_KEY);
  });

  it("replaces the one of the same scope and provider, keeping what the input leaves out", () => {
    const first = withAssignment(
      emptyKeysRecord(),
      {
        scope: EDITORS,
        provider: "openai",
        key: GROUP_KEY,
        models: ["gpt-6-luna"],
        personalTokens: true,
      },
      context,
    );

    const second = withAssignment(
      first.record,
      { scope: EDITORS, provider: "openai", models: null },
      { ...context, newId: () => "00000000000000b2" },
    );

    expect(second.record.assignments).toEqual([second.assignment]);
    expect(second.assignment).toMatchObject({
      id: "00000000000000a1",
      key: GROUP_KEY,
      personalTokens: true,
    });
    expect(second.assignment).not.toHaveProperty("models");
    expect(second.keyChanged).toBe(false);
  });

  it("removes its key with null, and says the key changed", () => {
    const first = withAssignment(
      emptyKeysRecord(),
      { scope: ALL, provider: "openai", key: ALL_KEY },
      context,
    );

    const second = withAssignment(
      first.record,
      { scope: ALL, provider: "openai", key: null },
      context,
    );

    expect(second.assignment).not.toHaveProperty("key");
    expect(second.keyChanged).toBe(true);
  });

  it("keeps the models in the app's order", () => {
    const saved = withAssignment(
      emptyKeysRecord(),
      {
        scope: ALL,
        provider: "openai",
        models: ["gpt-6-luna", "gpt-6.1-sol"],
      },
      context,
    );

    expect(saved.assignment.models).toEqual(["gpt-6.1-sol", "gpt-6-luna"]);
  });

  it.each<[string, MapoAiKeyAssignmentInput, string]>([
    [
      "a provider the app does not enable",
      { scope: ALL, provider: "anthropic" },
      "provider",
    ],
    [
      "a model the app does not enable",
      { scope: ALL, provider: "openai", models: ["gpt-5"] },
      "models",
    ],
    [
      "a model named twice",
      { scope: ALL, provider: "openai", models: ["gpt-6-luna", "gpt-6-luna"] },
      "models",
    ],
    [
      "a key for a provider that uses none",
      { scope: ALL, provider: "mock", key: ALL_KEY },
      "key",
    ],
    [
      "personal tokens for a provider that uses no key",
      { scope: ALL, provider: "mock", personalTokens: true },
      "personalTokens",
    ],
  ])("refuses %s with a 400", (_name, input, path) => {
    expect(() => withAssignment(emptyKeysRecord(), input, context)).toThrow(
      expect.objectContaining({
        statusCode: 400,
        data: expect.objectContaining({ path }),
      }),
    );
  });

  it("lets an admin close a provider to a scope, without a key", () => {
    const saved = withAssignment(
      emptyKeysRecord(),
      { scope: EDITORS, provider: "mock", models: [] },
      context,
    );

    expect(saved.assignment.models).toEqual([]);
    expect(saved.keyChanged).toBe(false);
  });

  it("refuses a new assignment when the record is full, with a 409", () => {
    const full = recordOf(
      Array.from({ length: 500 }, (_, index) =>
        assignment({ kind: "user", user: String(index) }),
      ),
    );

    expect(() =>
      withAssignment(full, { scope: ALL, provider: "openai" }, context),
    ).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  it("is removed by its id", () => {
    const saved = withAssignment(
      emptyKeysRecord(),
      { scope: ALL, provider: "openai", key: ALL_KEY },
      context,
    );

    expect(withoutAssignment(saved.record, "00000000000000a1")).toEqual({
      record: emptyKeysRecord(),
      removed: saved.assignment,
    });
    expect(withoutAssignment(saved.record, "ffffffffffffffff")).toBeUndefined();
  });
});

describe("the bodies of the routes of the keys", () => {
  it("reads an assignment, and refuses what is not one without repeating its key", () => {
    expect(
      readAssignmentInput({
        scope: { kind: "user", user: "4" },
        provider: "openai",
        key: USER_KEY,
        models: null,
      }),
    ).toEqual({
      scope: { kind: "user", user: "4" },
      provider: "openai",
      key: USER_KEY,
      models: null,
    });

    const leaked = "sk-with a space-0000000000000000LEAK";
    let refusal: unknown;
    try {
      readAssignmentInput({ scope: ALL, provider: "openai", key: leaked });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      statusCode: 400,
      data: {
        path: "key",
        problem: "a key is printable characters without spaces",
      },
    });
    expect(JSON.stringify(refusal)).not.toContain("LEAK");
  });

  it.each([
    [
      "a line break in a key",
      { scope: ALL, provider: "openai", key: "sk-a\r\nX-Evil: 1" },
    ],
    ["an empty key", { scope: ALL, provider: "openai", key: "" }],
    [
      "a group with blanks around",
      { scope: { kind: "group", group: " editors" }, provider: "openai" },
    ],
    [
      "a user without an id",
      { scope: { kind: "user", user: "" }, provider: "openai" },
    ],
    ["an unknown scope", { scope: { kind: "everyone" }, provider: "openai" }],
    ["a provider that is no id", { scope: ALL, provider: "OpenAI" }],
    ["an unknown field", { scope: ALL, provider: "openai", priority: 1 }],
  ])("refuses %s", (_name, body) => {
    expect(() => readAssignmentInput(body)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("reads an order of groups, each once", () => {
    expect(readGroupsInput({ groups: ["reporters", "editors"] })).toEqual([
      "reporters",
      "editors",
    ]);
    expect(() => readGroupsInput({ groups: ["editors", "editors"] })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("reads a token, and the query that removes one", () => {
    expect(readTokenInput({ provider: "openai", token: TOKEN })).toEqual({
      provider: "openai",
      token: TOKEN,
    });
    expect(() => readTokenInput({ provider: "openai", token: "a b" })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(readTokenRemoval({ provider: "openai", user: "4" })).toEqual({
      provider: "openai",
      user: "4",
    });
    expect(() => readTokenRemoval({})).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("reads back only a record this version writes", () => {
    const record = recordOf([assignment(ALL, { key: ALL_KEY })], ["editors"]);

    expect(readKeysRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(readKeysRecord({ ...record, v: 2 })).toBeUndefined();
    expect(readKeysRecord({ ...record, extra: true })).toBeUndefined();
  });
});

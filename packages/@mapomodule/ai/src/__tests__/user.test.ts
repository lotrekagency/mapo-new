import { describe, expect, expectTypeOf, it } from "vitest";
import type { NitroApp } from "nitropack/types";
import {
  canOnModel,
  isAiAdmin,
  matchesRule,
  mayUseAi,
  readAccessRule,
  readBackendUser,
} from "../runtime/server/auth/user";
import type {
  MapoAiAccessRules,
  MapoAiUser,
  MapoAiUserContext,
} from "../runtime/server/auth/user";
import type { MapoAiSecret } from "../runtime/server/storage/secret";
import type { MapoAiSecretState } from "../runtime/shared/gateway";

/** A user as the gateway reads them, with what a test needs. */
function aUser(fields: Partial<MapoAiUser> = {}): MapoAiUser {
  return {
    id: "2",
    superuser: false,
    groups: [],
    permissions: [],
    models: {},
    ...fields,
  };
}

const NO_RULES: MapoAiAccessRules = { admin: {} };

describe("readBackendUser", () => {
  it("reads the user the example backend returns", () => {
    const payload = {
      id: 2,
      username: "editor",
      is_superuser: false,
      all_permissions: ["view_article", "change_article"],
      groups: ["editors"],
    };

    expect(readBackendUser(payload)?.user).toEqual({
      id: "2",
      username: "editor",
      superuser: false,
      groups: ["editors"],
      permissions: ["view_article", "change_article"],
      models: {
        article: { view: true, add: false, change: true, delete: false },
      },
    });
  });

  it("reads permissions as the auth store does: objects with a codename, pks dropped", () => {
    const read = readBackendUser({
      id: "7",
      user_permissions: [{ codename: "add_page" }, 4],
    });

    expect(read?.user.permissions).toEqual(["add_page"]);
    expect(read?.user.models.page?.add).toBe(true);
  });

  it("keeps the whole payload for the app's hooks, fields it does not read included", () => {
    const read = readBackendUser({ id: 1, is_internal: true, is_staff: true });

    expect(read?.payload).toEqual({ id: 1, is_internal: true, is_staff: true });
  });

  it.each([
    ["no object", "editor"],
    ["a list", [{ id: 1 }]],
    ["null", null],
    ["an object without an id", { username: "editor" }],
    ["an empty id", { id: "  " }],
    ["an id that is neither text nor a number", { id: { pk: 1 } }],
    ["a boolean id", { id: true }],
  ])("finds no user in %s", (_case, payload) => {
    expect(readBackendUser(payload)).toBeUndefined();
  });

  it.each([
    ["the string true", "true"],
    ["the number 1", 1],
    ["missing", undefined],
  ])("does not make a superuser of is_superuser %s", (_case, value) => {
    expect(
      readBackendUser({ id: 1, is_superuser: value })?.user.superuser,
    ).toBe(false);
  });

  it("takes only strings as group names, as the auth store's checks do", () => {
    const read = readBackendUser({
      id: 1,
      groups: ["editors", { name: "admins" }, 3, null],
    });

    expect(read?.user.groups).toEqual(["editors"]);
    expect(readBackendUser({ id: 1, groups: "editors" })?.user.groups).toEqual(
      [],
    );
  });

  it("leaves out a username that is not text", () => {
    const read = readBackendUser({ id: 1, username: 42 });

    expect(read?.user).not.toHaveProperty("username");
  });

  it("freezes what it returns, so a hook cannot change the next request's user", () => {
    const read = readBackendUser({
      id: 1,
      groups: ["editors"],
      profile: { team: "news" },
    });
    if (!read) throw new Error("No user");

    expect(Object.isFrozen(read.user)).toBe(true);
    expect(Object.isFrozen(read.user.groups)).toBe(true);
    expect(Object.isFrozen(read.payload)).toBe(true);
    expect(Object.isFrozen(read.payload.profile)).toBe(true);
    expect(() => {
      (read.user.groups as string[]).push("admin");
    }).toThrow(TypeError);
  });

  it("freezes a payload with a cycle without running forever", () => {
    const payload: Record<string, unknown> = { id: 1 };
    payload.self = payload;

    expect(Object.isFrozen(readBackendUser(payload)?.payload)).toBe(true);
  });
});

describe("readAccessRule", () => {
  it.each([undefined, null])("reads %j as no rule", (value) => {
    expect(readAccessRule(value)).toBeUndefined();
  });

  it("reads groups and permissions", () => {
    expect(
      readAccessRule({ groups: ["ai-admin"], permissions: ["change_article"] }),
    ).toEqual({ groups: ["ai-admin"], permissions: ["change_article"] });
    expect(readAccessRule({})).toEqual({});
  });

  it.each([
    ["a list", ["ai-admin"]],
    ["a string", "ai-admin"],
    ["groups that are not a list", { groups: "ai-admin" }],
    ["a name that is not text", { groups: ["ai-admin", 3] }],
    ["a key it does not know", { group: ["ai-admin"] }],
  ])("finds %s unreadable", (_case, value) => {
    expect(readAccessRule(value)).toBe("invalid");
  });
});

describe("the access rules", () => {
  it("picks superusers with every rule, an empty one too", () => {
    const superuser = aUser({ superuser: true });

    expect(matchesRule(superuser, {})).toBe(true);
    expect(isAiAdmin(superuser, NO_RULES)).toBe(true);
    expect(mayUseAi(superuser, { admin: {}, users: {} })).toBe(true);
  });

  it("makes nobody but superusers an admin by default", () => {
    expect(isAiAdmin(aUser({ groups: ["admin"] }), NO_RULES)).toBe(false);
  });

  it("makes admins by group or by permission, either one", () => {
    const rules: MapoAiAccessRules = {
      admin: { groups: ["ai-admin"], permissions: ["change_settings"] },
    };

    expect(isAiAdmin(aUser({ groups: ["ai-admin"] }), rules)).toBe(true);
    expect(isAiAdmin(aUser({ permissions: ["change_settings"] }), rules)).toBe(
      true,
    );
    expect(isAiAdmin(aUser({ groups: ["editors"] }), rules)).toBe(false);
  });

  it("lets every user in without a users rule", () => {
    expect(mayUseAi(aUser(), NO_RULES)).toBe(true);
  });

  it("lets in, with a users rule, whom it picks and the AI's admins", () => {
    const rules: MapoAiAccessRules = {
      admin: { groups: ["ai-admin"] },
      users: { groups: ["editors"] },
    };

    expect(mayUseAi(aUser({ groups: ["editors"] }), rules)).toBe(true);
    expect(mayUseAi(aUser({ groups: ["ai-admin"] }), rules)).toBe(true);
    expect(mayUseAi(aUser({ groups: ["viewers"] }), rules)).toBe(false);
  });

  it("lets nobody but superusers and admins in with an empty users rule", () => {
    const rules: MapoAiAccessRules = { admin: {}, users: {} };

    expect(mayUseAi(aUser({ groups: ["editors"] }), rules)).toBe(false);
  });
});

describe("canOnModel", () => {
  const editor = readBackendUser({
    id: 2,
    all_permissions: ["view_article", "add_article", "change_page"],
  })?.user;
  if (!editor) throw new Error("No user");

  it("checks add_ for a new record and change_ for an existing one", () => {
    expect(canOnModel(editor, "article", "add")).toBe(true);
    expect(canOnModel(editor, "article", "change")).toBe(false);
    expect(canOnModel(editor, "page", "change")).toBe(true);
    expect(canOnModel(editor, "page", "add")).toBe(false);
  });

  it("refuses a model the user has no permission on", () => {
    expect(canOnModel(editor, "event", "add")).toBe(false);
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "refuses the model %s, named like an object property",
    (model) => {
      expect(canOnModel(editor, model, "add")).toBe(false);
      expect(canOnModel(editor, model, "change")).toBe(false);
    },
  );

  it("lets a superuser fill any model", () => {
    expect(canOnModel(aUser({ superuser: true }), "event", "change")).toBe(
      true,
    );
  });
});

describe("the types", () => {
  it("name the secret's states as the storage does", () => {
    expectTypeOf<MapoAiSecret["status"]>().toEqualTypeOf<MapoAiSecretState>();
  });

  // `expectTypeOf` checks run in `pnpm typecheck`, which includes the tests.
  it("type the mapo-ai:user hook for the app's Nitro plugins", () => {
    const register = (app: NitroApp) =>
      app.hooks.hook("mapo-ai:user", (context) => {
        expectTypeOf(context).toEqualTypeOf<MapoAiUserContext>();
        expectTypeOf(context.payload).toEqualTypeOf<
          Readonly<Record<string, unknown>>
        >();
        if (context.payload.is_internal !== true) context.allowed = false;
      });
    expectTypeOf(register).toBeFunction();
  });
});

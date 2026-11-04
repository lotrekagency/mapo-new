import { describe, it, expect } from "vitest";
import {
  modelPermissions,
  permissionCodenames,
  userPermissions,
} from "../permissions";

const NONE = { view: false, add: false, change: false, delete: false };

describe("permissionCodenames", () => {
  it.each([
    [
      "plain codenames",
      ["view_article", "add_page"],
      ["view_article", "add_page"],
    ],
    [
      "Django Permission objects",
      [
        { id: 4, name: "Can view article", codename: "view_article" },
        { id: 5, name: "Can change article", codename: "change_article" },
      ],
      ["view_article", "change_article"],
    ],
    ["bare pks", [4, 5], []],
    [
      "a mix, in the backend's order",
      [4, "add_page", { codename: "view_article" }],
      ["add_page", "view_article"],
    ],
    [
      "objects without a usable codename",
      [{ name: "Can view" }, { codename: 7 }, null, [], ["view_page"]],
      [],
    ],
  ])("reads %s", (_case, raw, expected) => {
    expect(permissionCodenames(raw)).toEqual(expected);
  });

  it.each([undefined, null, "view_article", 3, { codename: "view_article" }])(
    "reads %j, which is no list, as no permission",
    (raw) => {
      expect(permissionCodenames(raw)).toEqual([]);
    },
  );
});

describe("modelPermissions", () => {
  it("gives each model its four flags", () => {
    expect(
      modelPermissions(["view_article", "change_article", "delete_page"]),
    ).toEqual({
      article: { ...NONE, view: true, change: true },
      page: { ...NONE, delete: true },
    });
  });

  it("keeps the whole model name after the action", () => {
    expect(modelPermissions(["add_blog_post"])).toEqual({
      blog_post: { ...NONE, add: true },
    });
  });

  it.each(["publish_article", "blog.add_post", "view", "add_", "View_article"])(
    "leaves out %s, which is no model codename",
    (codename) => {
      expect(modelPermissions([codename])).toEqual({});
    },
  );

  it("gives a model named like an object property flags of its own", () => {
    const models = modelPermissions(["view_constructor", "add_toString"]);

    expect(
      Object.getOwnPropertyDescriptor(models, "constructor")?.value,
    ).toEqual({ ...NONE, view: true });
    expect(Object.getOwnPropertyDescriptor(models, "toString")?.value).toEqual({
      ...NONE,
      add: true,
    });
    expect("view" in Object).toBe(false);
    expect("add" in Object.prototype.toString).toBe(false);
  });

  it("leaves out a model named __proto__, and never touches the prototype", () => {
    const models = modelPermissions(["view___proto__", "add___proto__"]);

    expect(Object.keys(models)).toEqual([]);
    expect(Object.getPrototypeOf(models)).toBe(Object.prototype);
    expect("view" in {}).toBe(false);
    expect("add" in {}).toBe(false);
  });
});

describe("userPermissions", () => {
  it("reads all_permissions first", () => {
    const read = userPermissions({
      id: 1,
      all_permissions: [{ codename: "change_article" }],
      user_permissions: ["view_page"],
    });

    expect(read).toEqual({
      codenames: ["change_article"],
      models: { article: { ...NONE, change: true } },
      unreadable: false,
    });
  });

  it("falls back to user_permissions when all_permissions is missing or null", () => {
    for (const all_permissions of [undefined, null]) {
      expect(
        userPermissions({
          id: 1,
          all_permissions,
          user_permissions: ["add_page"],
        }).codenames,
      ).toEqual(["add_page"]);
    }
  });

  it("keeps an empty all_permissions, as the backend sent it", () => {
    expect(
      userPermissions({
        id: 1,
        all_permissions: [],
        user_permissions: ["add_page"],
      }).codenames,
    ).toEqual([]);
  });

  it("says when the backend sent permissions with no codename in them", () => {
    expect(userPermissions({ id: 1, user_permissions: [4, 5] })).toEqual({
      codenames: [],
      models: {},
      unreadable: true,
    });
    expect(
      userPermissions({ id: 1, all_permissions: "view_article" }).unreadable,
    ).toBe(true);
  });

  it.each([
    ["no permissions at all", { id: 1 }],
    ["an empty list", { id: 1, all_permissions: [] }],
    ["null", { id: 1, all_permissions: null, user_permissions: null }],
  ])("finds nothing unreadable in %s", (_case, user) => {
    expect(userPermissions(user).unreadable).toBe(false);
  });

  it.each([undefined, null, "admin", 1, ["view_article"]])(
    "gives %j, which is no user object, no permission",
    (user) => {
      expect(userPermissions(user)).toEqual({
        codenames: [],
        models: {},
        unreadable: false,
      });
    },
  );
});

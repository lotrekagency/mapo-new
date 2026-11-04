import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../runtime/stores/auth";

const base = { id: 1, username: "editor" };

describe("auth store — permission payload shapes", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("reads codenames off Django Permission objects", () => {
    // What camomilla's /api/camomilla/users/current/ actually returns. Assuming
    // strings here threw `codename.match is not a function` on every SSR boot.
    const auth = useAuthStore();
    auth.setUser({
      ...base,
      all_permissions: [
        { id: 4, name: "Can view article", codename: "view_article" },
        { id: 5, name: "Can change article", codename: "change_article" },
      ],
    });
    expect(auth.rawPermissions).toEqual(["view_article", "change_article"]);
    expect(auth.modelPermissions.article).toEqual({
      view: true,
      add: false,
      change: true,
      delete: false,
    });
  });

  it("still reads plain codenames", () => {
    const auth = useAuthStore();
    auth.setUser({ ...base, all_permissions: ["add_page", "delete_page"] });
    expect(auth.rawPermissions).toEqual(["add_page", "delete_page"]);
    expect(auth.modelPermissions.page).toEqual({
      view: false,
      add: true,
      change: false,
      delete: true,
    });
  });

  it("keeps codenames off the prototypes, whatever the model is called", () => {
    const auth = useAuthStore();
    auth.setUser({
      ...base,
      all_permissions: ["view_constructor", "add___proto__"],
    });
    expect(
      Object.getOwnPropertyDescriptor(auth.modelPermissions, "constructor")
        ?.value,
    ).toEqual({ view: true, add: false, change: false, delete: false });
    expect("view" in Object).toBe(false);
    expect("add" in {}).toBe(false);
  });

  it("reads permissions that are not a list as none, and says so, instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auth = useAuthStore();
    expect(() =>
      auth.setUser({ ...base, all_permissions: "view_article" as never }),
    ).not.toThrow();
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.rawPermissions).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("drops pks and says so, instead of locking the user out in silence", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auth = useAuthStore();
    auth.setUser({ ...base, user_permissions: [4, 5] });
    expect(auth.rawPermissions).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

/**
 * A user's permissions, read from the payload a Django-style backend sends
 * (`userInfoApi`): one reading, pure, so code in the browser and code on
 * the server that read the same user decide alike.
 */

/** What a user may do with one model, from the codenames `<action>_<model>`. */
export interface ModelPermissions {
  view: boolean;
  add: boolean;
  change: boolean;
  delete: boolean;
}

/** A user's permissions, as {@link userPermissions} reads them. */
export interface UserPermissions {
  /** The codenames, in the backend's order: `view_article`, `change_article`. */
  codenames: string[];
  /** The flags of each model, from the codenames of the form `<action>_<model>`. */
  models: Record<string, ModelPermissions>;
  /**
   * Whether the backend sent permissions with no codename in them, such as
   * bare pks: every model permission is then off, which a caller should say.
   */
  unreadable: boolean;
}

const MODEL_CODENAME = /^(view|add|change|delete)_(.+)$/;

/**
 * The codenames in a list of permissions, whatever shape the backend sent.
 * Camomilla alone uses three: its current user carries Django `Permission`
 * objects, its user list bare pks, and the rest of the ecosystem sends plain
 * codenames. A pk is dropped rather than stringified: nothing here can turn
 * one into a codename, and keeping it would grant nothing anyway.
 *
 * @example
 * permissionCodenames(["view_article", { codename: "change_article" }, 4])
 * // ["view_article", "change_article"]
 * @param raw the list as the backend sent it; anything else reads as no permission
 */
export function permissionCodenames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((permission: unknown) => {
    if (typeof permission === "string") return [permission];
    const codename = isRecord(permission) ? permission.codename : undefined;
    return typeof codename === "string" ? [codename] : [];
  });
}

/**
 * The flags of each model, from the codenames of the form `<action>_<model>`,
 * where the action is `view`, `add`, `change` or `delete`. Other codenames
 * are left out.
 *
 * The flags are built apart and copied in at the end, so a model named like
 * a property every object has (`constructor`) gets flags of its own and
 * never writes to the object's prototype. A model named `__proto__` is left
 * out: no backend has one, and the name cannot travel in a page's payload.
 *
 * @example
 * modelPermissions(["view_article", "change_article"])
 * // { article: { view: true, add: false, change: true, delete: false } }
 */
export function modelPermissions(
  codenames: readonly string[],
): Record<string, ModelPermissions> {
  const byModel = new Map<string, ModelPermissions>();
  for (const codename of codenames) {
    const match = MODEL_CODENAME.exec(codename);
    if (!match) continue;
    const action = match[1] as keyof ModelPermissions;
    const model = match[2];
    if (model === "__proto__") continue;
    let flags = byModel.get(model);
    if (!flags) {
      flags = { view: false, add: false, change: false, delete: false };
      byModel.set(model, flags);
    }
    flags[action] = true;
  }
  return Object.fromEntries(byModel);
}

/**
 * The permissions of a user payload: `all_permissions` when the backend
 * sends them (the user's own and those of their groups), otherwise
 * `user_permissions`.
 *
 * @example
 * userPermissions({ id: 1, all_permissions: [{ codename: "add_page" }] })
 * // { codenames: ["add_page"], models: { page: { …, add: true, … } }, unreadable: false }
 * @param user the user as the backend sent it; anything but an object has no permission
 */
export function userPermissions(user: unknown): UserPermissions {
  const fields: Record<string, unknown> = isRecord(user) ? user : {};
  const raw = fields.all_permissions ?? fields.user_permissions;
  const codenames = permissionCodenames(raw);
  const isList = Array.isArray(raw);
  const isSent = raw !== undefined && raw !== null;
  const hasEntries = isList ? raw.length > 0 : isSent;
  return {
    codenames,
    models: modelPermissions(codenames),
    unreadable: hasEntries && codenames.length === 0,
  };
}

/** An object read as outside data: its values are `unknown`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

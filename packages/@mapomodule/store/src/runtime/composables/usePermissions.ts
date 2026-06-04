import { useAuthStore } from "../stores/auth";

/**
 * Provides convenience permission/role guards derived from the auth store.
 *
 * All checks automatically grant access to superusers.
 *
 * Exposed guards:
 * - `canView(model)`, `canAdd(model)`, `canChange(model)`, `canDelete(model)`
 *   read model-level capabilities from `auth.modelPermissions`.
 * - `checkPermission(codename)` checks raw permission codenames.
 * - `hasRole(role)` checks whether the user belongs to a specific group.
 */
export function usePermissions() {
  const auth = useAuthStore();

  return {
    canView: (model: string) =>
      !!auth.info?.is_superuser || !!auth.modelPermissions[model]?.view,

    canAdd: (model: string) =>
      !!auth.info?.is_superuser || !!auth.modelPermissions[model]?.add,

    canChange: (model: string) =>
      !!auth.info?.is_superuser || !!auth.modelPermissions[model]?.change,

    canDelete: (model: string) =>
      !!auth.info?.is_superuser || !!auth.modelPermissions[model]?.delete,

    checkPermission: (codename: string) =>
      !!auth.info?.is_superuser || auth.rawPermissions.includes(codename),

    hasRole: (role: string) => auth.info?.groups?.includes(role) ?? false,
  };
}

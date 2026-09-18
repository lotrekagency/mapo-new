/**
 * A permission as a backend actually sends it.
 *
 * Camomilla alone uses all three shapes: `users/current/` serializes
 * `all_permissions` as full Django Permission objects, its user list serializes
 * `user_permissions` as bare pks, and plain codenames are what the rest of the
 * ecosystem sends. Only the codename is usable here — see `setUser`.
 */
export type MapoPermission =
  | string
  | number
  | { codename?: string; [key: string]: unknown };

export interface MapoUser {
  id: string | number;
  username: string;
  email?: string;
  is_superuser?: boolean;
  all_permissions?: MapoPermission[];
  user_permissions?: MapoPermission[];
  groups?: string[];
}

export interface ModelPermissions {
  view: boolean;
  add: boolean;
  change: boolean;
  delete: boolean;
}

export enum SnackTypeEnum {
  Info = "info",
  Success = "success",
  Warning = "warning",
  Error = "error",
}

export type SnackType = `${SnackTypeEnum}`;

export interface SnackMessage {
  id: number;
  message: string;
  type: SnackType;
  duration: number;
}

export enum SidebarCookieEnum {
  Drawer = "sidebar_drawer",
  Mini = "sidebar_minivariant",
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  dangerous?: boolean;
}

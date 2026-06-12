export interface MapoUser {
  id: string | number;
  username: string;
  email?: string;
  is_superuser?: boolean;
  all_permissions?: string[];
  user_permissions?: string[];
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

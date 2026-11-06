/**
 * Build time: the `settings` option, which says where the AI settings page
 * is and which endpoints of the backend list users and groups for the
 * admins. A value that cannot be read keeps its default, and the build
 * says so.
 */

import { isRecord } from "./runtime/shared/guards";

/** The AI settings page and the endpoints it searches, as the module uses them. */
export interface MapoAiSettingsPage {
  /** Where the page is; `false`: the module adds none. */
  path: string | false;
  /** The page's entry in the sidebar. */
  label: string;
  /** The backend's endpoint of users, for the admins to pick one by name. */
  usersApi?: string;
  /** The backend's endpoint of groups. */
  groupsApi?: string;
}

/** Where the module puts the page unless the app says otherwise. */
export const DEFAULT_SETTINGS_PATH = "/ai-settings";
/** The page's entry in the sidebar unless the app says otherwise. */
export const DEFAULT_SETTINGS_LABEL = "AI settings";

const KNOWN = new Set(["path", "label", "usersApi", "groupsApi"]);

/**
 * `mapo.ai.settings`, read as outside data: the defaults for what is not
 * set or cannot be read.
 * @param warn where the build's warnings go
 */
export function settingsOption(
  value: unknown,
  warn: (message: string) => void,
): MapoAiSettingsPage {
  const page: MapoAiSettingsPage = {
    path: DEFAULT_SETTINGS_PATH,
    label: DEFAULT_SETTINGS_LABEL,
  };
  if (value === undefined || value === null) return page;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.settings is not { path?, label?, usersApi?, groupsApi? }, so the AI settings page keeps its defaults.",
    );
    return page;
  }
  const unknown = Object.keys(value).filter((key) => !KNOWN.has(key));
  if (unknown.length) {
    warn(
      `mapo.ai.settings has no ${unknown.map((key) => `"${key}"`).join(", ")}: ignored.`,
    );
  }
  const { path, label, usersApi, groupsApi } = value;
  if (path === false) page.path = false;
  else if (path !== undefined) {
    if (isPagePath(path)) page.path = path;
    else {
      warn(
        `mapo.ai.settings.path is not a path such as "/ai-settings", or false, so the page is at ${DEFAULT_SETTINGS_PATH}.`,
      );
    }
  }
  if (label !== undefined) {
    const isLabel =
      typeof label === "string" && label.trim() !== "" && label.length <= 80;
    if (isLabel) page.label = label.trim();
    else {
      warn(
        `mapo.ai.settings.label is not a text of up to 80 characters, so the page is "${DEFAULT_SETTINGS_LABEL}" in the sidebar.`,
      );
    }
  }
  for (const [name, endpoint] of [
    ["usersApi", usersApi],
    ["groupsApi", groupsApi],
  ] as const) {
    if (endpoint === undefined) continue;
    if (isEndpoint(endpoint)) page[name] = endpoint;
    else {
      warn(
        `mapo.ai.settings.${name} is not a path of the backend such as "/api/users/", so the admins write ${name === "usersApi" ? "a user's id" : "a group's name"} instead.`,
      );
    }
  }
  return page;
}

/** A path of the app: `/` and then letters, digits, `-`, `_` and `/`. */
function isPagePath(value: unknown): value is string {
  return typeof value === "string" && /^\/[\w\-/]*$/.test(value);
}

/** A path or an address of the backend, with no spaces. */
function isEndpoint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:\/|https?:\/\/)\S*$/.test(value) &&
    value.length <= 500
  );
}

/**
 * Diagnostic rules over the app snapshot.
 *
 * Pure and transport-agnostic so the whole rule set is unit-testable against a
 * crafted manifest. Every finding must be *actionable*: what is wrong, why it
 * matters, and the exact change to make.
 */
import type { MapoAppManifest } from "../../index.js";

export type DoctorSeverity = "error" | "warning" | "info";

export interface DoctorFinding {
  rule: string;
  severity: DoctorSeverity;
  message: string;
  /** Concrete change to apply. */
  fix?: string;
  /** Documentation path that explains the topic. */
  doc?: string;
}

/** Mirrors `MAPO_DEFAULTS` in `@mapomodule/core`. */
const AUTH_DEFAULTS: Record<string, string> = {
  authLoginUrl: "/api/auth/login",
  userInfoApi: "/api/profiles/me/",
  logoutUrl: "/api/auth/logout",
  loginUrl: "/login",
};

/** Mirrors `MAPO_MEDIA_DEFAULTS.endpoints` in `@mapomodule/uikit`. */
const MEDIA_ENDPOINT_DEFAULTS = {
  media: "/api/media",
  folders: "/api/media-folders",
};

/** Locales Mapo ships UI catalogs for. */
const BUNDLED_LOCALES = new Set(["en", "it"]);

const MEDIA_FIELD_TYPES = new Set(["media", "media-m2m", "enhanced-media"]);

function section(
  manifest: MapoAppManifest,
  key: string,
): Record<string, unknown> {
  const value = manifest.config[key];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Runs every rule and returns the findings, most severe first. */
export function runDoctor(manifest: MapoAppManifest): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const core = section(manifest, "mapoCore");
  const media = section(manifest, "mapoMedia");
  const moduleNames = new Set(manifest.modules.map((module) => module.name));

  // 1. Module order. `@nuxt/ui` must be registered before Mapo: installing it
  //    from inside another module makes @nuxt/icon's SSR component loop.
  const order = manifest.moduleOrder;
  const uiIndex = order.indexOf("@nuxt/ui");
  const mapoIndex = order.findIndex(
    (name) => name === "mapomodule" || name.startsWith("@mapomodule/"),
  );

  if (mapoIndex !== -1 && uiIndex === -1) {
    findings.push({
      rule: "nuxt-ui-missing",
      severity: "error",
      message:
        "`@nuxt/ui` is not declared in `modules[]`, but Mapo's UI layer requires it.",
      fix: 'Add "@nuxt/ui" as the first entry of `modules[]`.',
      doc: "guide/getting-started.md",
    });
  } else if (mapoIndex !== -1 && uiIndex > mapoIndex) {
    findings.push({
      rule: "nuxt-ui-order",
      severity: "error",
      message:
        `\`@nuxt/ui\` is declared after \`${order[mapoIndex]}\` in modules[]. ` +
        "Icons break during SSR when Nuxt UI is initialised after Mapo.",
      fix: 'Move "@nuxt/ui" before the Mapo entry in `modules[]`.',
      doc: "guide/compatibility.md",
    });
  }

  // 2. Mapo itself must be there. A partial install is worth catching early.
  if (!moduleNames.has("@mapomodule/core")) {
    findings.push({
      rule: "core-missing",
      severity: "error",
      message:
        "`@mapomodule/core` is not installed — auth, `useCrud` and route middleware are unavailable.",
      fix: 'Add "mapomodule" to `modules[]`.',
      doc: "guide/getting-started.md",
    });
  }

  // 3. The login route must exist, or the auth middleware redirects to a 404.
  const loginUrl =
    typeof core.loginUrl === "string" ? core.loginUrl : AUTH_DEFAULTS.loginUrl!;
  const hasLoginRoute = manifest.routes.some(
    (route) => route.path === loginUrl,
  );

  if (!hasLoginRoute && manifest.routes.length > 0) {
    findings.push({
      rule: "login-route-missing",
      severity: "error",
      message: `No page matches \`loginUrl\` (\`${loginUrl}\`); the auth middleware would redirect to a missing route.`,
      fix: `Create \`pages${loginUrl}.vue\` rendering <MapoLogin /> with \`definePageMeta({ layout: false })\`, or change \`mapo.loginUrl\`.`,
      doc: "howto/auth-permissions.md",
    });
  }

  // 4. Untouched auth configuration: fine for a demo, wrong against a backend.
  const authKeys = ["authLoginUrl", "userInfoApi", "logoutUrl"];
  const allDefault = authKeys.every(
    (key) => (core[key] ?? AUTH_DEFAULTS[key]) === AUTH_DEFAULTS[key],
  );

  if (allDefault) {
    findings.push({
      rule: "auth-endpoints-default",
      severity: "info",
      message:
        "Auth endpoints are still the Mapo defaults — fine for a mock backend, not for a real one.",
      fix: "Set `mapo.authLoginUrl`, `mapo.userInfoApi` and `mapo.logoutUrl` to your backend routes.",
      doc: "howto/backend-integration.md",
    });
  }

  // 5. Nothing built yet.
  const adminRoutes = manifest.routes.filter(
    (route) => route.path !== loginUrl,
  );
  if (adminRoutes.length === 0) {
    findings.push({
      rule: "no-admin-pages",
      severity: "warning",
      message:
        "The app has no admin page yet (only the login route was found).",
      fix: 'Create a page with `definePageMeta({ layout: "mapo-default", middleware: ["auth"] })`.',
      doc: "howto/first-admin-page.md",
    });
  }

  // 6. Locales without a Mapo catalog fall back to the default locale for
  //    framework strings; app strings are unaffected.
  const uncovered = manifest.locales.filter(
    (locale) => !BUNDLED_LOCALES.has(locale),
  );
  if (uncovered.length) {
    findings.push({
      rule: "locale-without-catalog",
      severity: "warning",
      message: `Mapo ships UI catalogs for en and it only; ${uncovered.join(", ")} will fall back for framework strings.`,
      fix: "Add the missing `mapo.*` keys to your own `i18n/locales/<code>.json`.",
      doc: "howto/i18n.md",
    });
  }

  // 7. Media fields registered while the endpoints are untouched and no
  //    integration provides them.
  const usesMedia = manifest.fieldTypes.some((field) =>
    MEDIA_FIELD_TYPES.has(field.type),
  );
  const endpoints = (media.endpoints ?? {}) as Record<string, string>;
  const mediaDefaults =
    (endpoints.media ?? MEDIA_ENDPOINT_DEFAULTS.media) ===
      MEDIA_ENDPOINT_DEFAULTS.media &&
    (endpoints.folders ?? MEDIA_ENDPOINT_DEFAULTS.folders) ===
      MEDIA_ENDPOINT_DEFAULTS.folders;

  if (
    usesMedia &&
    mediaDefaults &&
    !moduleNames.has("mapo-integrations-camomilla")
  ) {
    findings.push({
      rule: "media-endpoints-default",
      severity: "info",
      message:
        "Media field types are registered but the media endpoints are still the defaults " +
        `(\`${MEDIA_ENDPOINT_DEFAULTS.media}\`, \`${MEDIA_ENDPOINT_DEFAULTS.folders}\`) and no integration provides them.`,
      fix: "Set `mapo.uikit.media.endpoints`, or install an integration that serves them.",
      doc: "howto/media-manager.md",
    });
  }

  const rank: Record<DoctorSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** What the build-time snapshot structurally cannot see. */
export const DOCTOR_BLIND_SPOTS = [
  "field types registered at runtime by `defineFormField()` inside a plugin",
  "`definePageMeta` values (layout, middleware, permissions) of your pages",
  "anything that depends on a request, such as the logged-in user's permissions",
];

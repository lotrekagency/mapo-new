import { describe, expect, it } from "vitest";
import { runDoctor } from "../runtime/core/doctor.js";
import { makeManifest } from "./fixtures.js";

/** Convenience: the rule ids reported for a manifest. */
function rulesFor(
  overrides: Parameters<typeof makeManifest>[0] = {},
): string[] {
  return runDoctor(makeManifest(overrides)).map((finding) => finding.rule);
}

describe("runDoctor", () => {
  it("stays silent on a healthy app", () => {
    expect(runDoctor(makeManifest())).toEqual([]);
  });

  it("flags @nuxt/ui declared after Mapo", () => {
    const findings = runDoctor(
      makeManifest({ moduleOrder: ["mapomodule", "@nuxt/ui"] }),
    );

    expect(findings[0]!.rule).toBe("nuxt-ui-order");
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.fix).toContain("before");
  });

  it("flags @nuxt/ui missing entirely", () => {
    expect(rulesFor({ moduleOrder: ["mapomodule"] })).toContain(
      "nuxt-ui-missing",
    );
  });

  it("ignores module order when Mapo is not registered by name", () => {
    // An app may register the modules through a layer or an inline function.
    expect(rulesFor({ moduleOrder: ["@nuxt/ui"] })).not.toContain(
      "nuxt-ui-order",
    );
  });

  it("flags a missing login route against the configured loginUrl", () => {
    const findings = runDoctor(
      makeManifest({ routes: [{ path: "/articles" }] }),
    );
    const login = findings.find(
      (finding) => finding.rule === "login-route-missing",
    )!;

    expect(login.severity).toBe("error");
    expect(login.message).toContain("/login");
    expect(login.fix).toContain("MapoLogin");
  });

  it("honours a custom loginUrl", () => {
    const manifest = makeManifest({
      config: { mapoCore: { loginUrl: "/admin/signin" } },
      routes: [{ path: "/admin/signin" }, { path: "/articles" }],
    });

    expect(runDoctor(manifest).map((f) => f.rule)).not.toContain(
      "login-route-missing",
    );
  });

  it("reports untouched auth endpoints as info, not as an error", () => {
    const findings = runDoctor(
      makeManifest({ config: { mapoCore: { loginUrl: "/login" } } }),
    );
    const auth = findings.find(
      (finding) => finding.rule === "auth-endpoints-default",
    )!;

    expect(auth.severity).toBe("info");
  });

  it("notices an app with no admin page yet", () => {
    expect(rulesFor({ routes: [{ path: "/login" }] })).toContain(
      "no-admin-pages",
    );
  });

  it("warns about locales Mapo has no catalog for", () => {
    const findings = runDoctor(makeManifest({ locales: ["en", "fr", "de"] }));
    const locale = findings.find((f) => f.rule === "locale-without-catalog")!;

    expect(locale.message).toContain("fr, de");
    expect(locale.message).not.toContain("en,");
  });

  it("flags media fields left on the default endpoints", () => {
    const rules = rulesFor({
      fieldTypes: [{ type: "enhanced-media", source: "default" }],
    });
    expect(rules).toContain("media-endpoints-default");
  });

  it("stays silent when the media endpoints are configured", () => {
    const rules = rulesFor({
      fieldTypes: [{ type: "media", source: "default" }],
      config: {
        mapoCore: makeManifest().config.mapoCore,
        mapoMedia: {
          endpoints: { media: "/api/cms/media", folders: "/api/cms/folders" },
        },
      },
    });
    expect(rules).not.toContain("media-endpoints-default");
  });

  it("stays silent when an integration provides the media endpoints", () => {
    const rules = rulesFor({
      fieldTypes: [{ type: "media", source: "default" }],
      modules: [
        ...makeManifest().modules,
        { name: "mapo-integrations-camomilla", version: "0.0.0" },
      ],
    });
    expect(rules).not.toContain("media-endpoints-default");
  });

  it("detects a broken install", () => {
    const rules = rulesFor({ modules: [{ name: "@mapomodule/uikit" }] });
    expect(rules).toContain("core-missing");
  });

  it("sorts errors before warnings and warnings before info", () => {
    const findings = runDoctor(
      makeManifest({
        moduleOrder: ["mapomodule", "@nuxt/ui"],
        routes: [],
        locales: ["fr"],
        config: { mapoCore: {} },
      }),
    );
    const severities = findings.map((finding) => finding.severity);

    expect(severities).toEqual(
      [...severities].sort(
        (a, b) =>
          ({ error: 0, warning: 1, info: 2 })[a] -
          { error: 0, warning: 1, info: 2 }[b],
      ),
    );
    expect(severities[0]).toBe("error");
  });
});

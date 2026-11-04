import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractComposables } from "../build/extract-composables";

let repoRoot: string;

/** A repository with one Mapo module that auto-imports for the app and for its server. */
function writeModule(): void {
  const pkg = join(repoRoot, "packages", "@mapomodule", "demo", "src");
  mkdirSync(join(pkg, "runtime"), { recursive: true });
  writeFileSync(
    join(pkg, "module.ts"),
    `
    addImports([
      { name: "useDemo", from: resolver.resolve("./runtime/useDemo") },
    ]);
    addServerImports([
      { name: "registerDemoServer", from: resolver.resolve("./runtime/server") },
    ]);
    `,
  );
  writeFileSync(
    join(pkg, "runtime", "useDemo.ts"),
    "/** A composable of the app. */\nexport function useDemo(): number {\n  return 1;\n}\n",
  );
  writeFileSync(
    join(pkg, "runtime", "server.ts"),
    "/** For the server's code only. */\nexport function registerDemoServer(): void {}\n",
  );
}

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "mapo-composables-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("extractComposables", () => {
  it("lists what addImports gives the app, with its description", () => {
    writeModule();

    const composables = extractComposables(repoRoot, () => []);

    expect(composables).toMatchObject([
      {
        name: "useDemo",
        pkg: "@mapomodule/demo",
        description: "A composable of the app.",
      },
    ]);
  });

  it("reads past a parenthesis in a comment or a string of the call", () => {
    const pkg = join(repoRoot, "packages", "@mapomodule", "demo", "src");
    mkdirSync(join(pkg, "runtime"), { recursive: true });
    writeFileSync(
      join(pkg, "module.ts"),
      `
      addImports([
        // the first one :)
        { name: "useFirst", from: resolver.resolve("./runtime/first") },
        /* ) */ { name: "useSecond", from: resolver.resolve("./runtime/second") },
        { name: "useThird", from: resolver.resolve(")" && "./runtime/third") },
      ]);
      `,
    );
    for (const name of ["first", "second", "third"]) {
      const exported = `use${name[0]?.toUpperCase()}${name.slice(1)}`;
      writeFileSync(
        join(pkg, "runtime", `${name}.ts`),
        `export function ${exported}(): void {}\n`,
      );
    }

    const names = extractComposables(repoRoot, () => []).map(
      (composable) => composable.name,
    );

    expect(names).toEqual(["useFirst", "useSecond", "useThird"]);
  });

  it("leaves out what addServerImports gives the server's code", () => {
    writeModule();

    const names = extractComposables(repoRoot, () => []).map(
      (composable) => composable.name,
    );

    expect(names).not.toContain("registerDemoServer");
  });
});

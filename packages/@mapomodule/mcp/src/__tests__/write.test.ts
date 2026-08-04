/**
 * The write guard is the only code here that can damage a project, so it gets
 * the most adversarial tests: traversal, symlinks, absolute paths, and the
 * refusal to replace existing work.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveInsideRoot, writeScaffold } from "../runtime/core/write.js";

let root: string;
let outside: string;

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), "mapo-write-"));
  root = join(base, "project");
  outside = join(base, "elsewhere");
  mkdirSync(root, { recursive: true });
  mkdirSync(outside, { recursive: true });
});

describe("resolveInsideRoot", () => {
  it("resolves a normal relative path", () => {
    expect(resolveInsideRoot(root, "app/pages/index.vue")).toContain(
      "app/pages/index.vue",
    );
  });

  it("refuses traversal out of the root", () => {
    expect(resolveInsideRoot(root, "../elsewhere/evil.ts")).toBeNull();
    expect(resolveInsideRoot(root, "app/../../elsewhere/evil.ts")).toBeNull();
  });

  it("refuses absolute paths", () => {
    expect(resolveInsideRoot(root, "/etc/passwd")).toBeNull();
  });

  it("refuses a path escaping through a symlinked directory", () => {
    // `project/link` points outside: writing "link/evil.ts" would land there.
    symlinkSync(outside, join(root, "link"));
    expect(resolveInsideRoot(root, "link/evil.ts")).toBeNull();
  });

  it("accepts a symlink that stays inside the root", () => {
    mkdirSync(join(root, "real"));
    symlinkSync(join(root, "real"), join(root, "alias"));
    expect(resolveInsideRoot(root, "alias/page.vue")).toContain("real");
  });

  it("does not accept a sibling directory sharing the root's prefix", () => {
    // `/tmp/x/project-evil` must not pass a naive `startsWith(root)` check.
    expect(resolveInsideRoot(root, "../project-evil/file.ts")).toBeNull();
  });
});

describe("writeScaffold", () => {
  const file = {
    path: "app/pages/articles/index.vue",
    content: "<template>ok</template>\n",
  };

  it("creates the file and its parent directories", () => {
    const [outcome] = writeScaffold([file], { root });

    expect(outcome!.status).toBe("written");
    expect(readFileSync(outcome!.absolute!, "utf-8")).toContain("ok");
  });

  it("refuses to replace an existing file by default", () => {
    writeScaffold([file], { root });
    const [outcome] = writeScaffold(
      [{ ...file, content: "<template>overwritten</template>" }],
      { root },
    );

    expect(outcome!.status).toBe("exists");
    expect(outcome!.reason).toContain("overwrite");
    expect(readFileSync(join(root, file.path), "utf-8")).toContain("ok");
  });

  it("replaces it when overwrite is explicit", () => {
    writeScaffold([file], { root });
    const [outcome] = writeScaffold(
      [{ ...file, content: "<template>overwritten</template>" }],
      { root, overwrite: true },
    );

    expect(outcome!.status).toBe("written");
    expect(readFileSync(join(root, file.path), "utf-8")).toContain(
      "overwritten",
    );
  });

  it("writes nothing when the adapter forbids it", () => {
    const [outcome] = writeScaffold([file], { root, allowed: false });

    expect(outcome!.status).toBe("not-allowed");
    expect(existsSync(join(root, file.path))).toBe(false);
  });

  it("reports each file separately instead of aborting the batch", () => {
    const outcomes = writeScaffold(
      [
        file,
        { path: "../escape.ts", content: "x" },
        { path: "/tmp/abs.ts", content: "x" },
      ],
      { root },
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "written",
      "outside-root",
      "absolute-path",
    ]);
    expect(existsSync(join(outside, "..", "escape.ts"))).toBe(false);
  });

  it("leaves a pre-existing file untouched when the write is refused", () => {
    const target = join(root, "keep.ts");
    writeFileSync(target, "original");
    writeScaffold([{ path: "keep.ts", content: "replaced" }], { root });

    expect(readFileSync(target, "utf-8")).toBe("original");
  });
});

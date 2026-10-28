import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PAGES = fileURLToPath(new URL("../runtime/pages/", import.meta.url));

describe("built-in pages", () => {
  // Apps load these pages from node_modules, where Nuxt adds no auto-imports:
  // a bare `definePageMeta()` there fails with "definePageMeta is not defined".
  it.each(readdirSync(PAGES).filter((file) => file.endsWith(".vue")))(
    "%s leaves its route meta to the module",
    (file) => {
      const source = readFileSync(`${PAGES}${file}`, "utf8");
      expect(source).not.toMatch(/\bdefinePageMeta\s*\(/);
    },
  );
});

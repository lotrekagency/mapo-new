#!/usr/bin/env node
// Removes the EMPTY `.vue.d.ts` / `.d.vue.ts` stubs that nuxt-module-build
// (mkdist) emits next to copied `.vue` files in dist/.
//
// TypeScript prefers a sibling `.d.ts` over analysing the `.vue` source, so an
// empty declaration silently degrades every component type (props, generics,
// typed slots) to `any` for consumers of the built package. Deleting the empty
// stubs lets vue-tsc fall through to the real `.vue` file, which it can type
// directly.
//
// Usage: node ../../../scripts/clean-empty-vue-dts.mjs dist
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist";
let removed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (
      (entry.name.endsWith(".vue.d.ts") || entry.name.endsWith(".d.vue.ts")) &&
      statSync(path).size === 0
    ) {
      unlinkSync(path);
      removed++;
    }
  }
}

walk(root);
console.log(`[clean-empty-vue-dts] removed ${removed} empty stub(s) in ${root}`);

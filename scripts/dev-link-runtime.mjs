// Development-only glue that scripts/dev-link.mjs copies into every linked
// package as `dist/dev-link.mjs`, next to the `dev-link.json` that describes
// the link. The generated `dist/module.mjs` stubs use it to load the package's
// TypeScript sources and to wrap the Nuxt module, so that the consuming app:
//   - watches the linked sources (Vite and Nuxt never watch node_modules),
//     which turns runtime edits into HMR updates;
//   - transpiles @mapomodule/utils, the only linked package that is not a
//     Nuxt module, whose stubs point at TypeScript sources;
//   - restarts when module setup code changes, since Node loads it only once;
//   - skips @mapomodule/mcp when the app's install predates it.
// None of this ships: `pnpm dev:link --restore` puts the published dist back.
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { useLogger } from "@nuxt/kit";

/** `{ name, linked, source }`, written by dev-link for this package. */
const link = JSON.parse(
  readFileSync(new URL("./dev-link.json", import.meta.url), "utf8"),
);
const logger = useLogger("mapo:dev-link");
// Package root: this file always lives in `<package>/dist/`.
const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
// Shared by the helper copies of every linked package of the same app.
const STATE = Symbol.for("mapo:dev-link");

/** Imports one of this package's TypeScript sources, relative to `from`. */
export async function importSource(from, path) {
  const { createJiti } = await loadJiti();
  const jiti = createJiti(from, {
    interopDefault: true,
    alias: { [link.name]: root },
  });
  return jiti.import(fileURLToPath(new URL(path, from)));
}

/** Wraps a Nuxt module so the link is configured before its setup runs. */
export function wrapModule(nuxtModule) {
  if (typeof nuxtModule !== "function") return nuxtModule;
  const wrapped = (inlineOptions, nuxt) => {
    if (nuxt) configure(nuxt);
    // The local meta-module installs @mapomodule/mcp in development, but an
    // app installed from an older mapomodule release does not have it.
    if (link.name === "mapomodule" && !isInstalled("@mapomodule/mcp")) {
      logger.info("@mapomodule/mcp is not installed in this app, skipping it");
      inlineOptions = { ...inlineOptions, mcp: false };
    }
    return nuxtModule(inlineOptions, nuxt);
  };
  // Keeps getMeta, getOptions, getModuleDependencies, onInstall, onUpgrade.
  return Object.assign(wrapped, nuxtModule);
}

async function loadJiti() {
  try {
    return await import("jiti");
  } catch {
    // Not hoisted where this package can see it: use the copy Nuxt depends on.
    const require = createRequire(import.meta.url);
    const nuxt = require.resolve("nuxt/package.json");
    return import(pathToFileURL(createRequire(nuxt).resolve("jiti")).href);
  }
}

function configure(nuxt) {
  const state = (nuxt[STATE] ??= { packages: new Map(), configured: false });
  state.packages.set(root, link.name);
  if (state.configured) return;
  state.configured = true;

  // Negated globs win over every other `ignored` entry (Nuxt adds a
  // node_modules RegExp), so edits to the linked sources reach Vite.
  const vite = nuxt.options.vite;
  vite.server ??= {};
  vite.server.watch ??= {};
  vite.server.watch.ignored = [
    ...[vite.server.watch.ignored ?? []].flat(),
    ...link.linked.map((name) => `!**/node_modules/${name}/**`),
  ];

  // Nuxt transpiles installed modules on its own; utils is a plain package
  // whose stubs re-export TypeScript, which Node cannot load as an external.
  if (link.linked.includes("@mapomodule/utils")) {
    nuxt.options.build.transpile.push("@mapomodule/utils");
  }

  // Nitro transpiles TypeScript only outside node_modules (Nuxt sets its
  // esbuild `exclude` to a node_modules RegExp), and the linked
  // `dist/runtime` holds TypeScript sources: keep the linked packages, but
  // not their own node_modules, out of that exclude.
  nuxt.hook("nitro:config", (config) => {
    const options = ((config.esbuild ??= {}).options ??= {});
    const names = link.linked.map(escapeRE).join("|");
    const linked = `^(?![\\s\\S]*node_modules/(?:${names})/(?!node_modules/))`;
    options.exclude = [options.exclude ?? /node_modules/].flat().map((pattern) =>
      pattern instanceof RegExp
        ? new RegExp(`${linked}[\\s\\S]*?(?:${pattern.source})`, pattern.flags)
        : pattern,
    );
  });

  logger.info(
    `Using local sources from ${link.source} for ${link.linked.join(", ")}`,
  );

  if (!nuxt.options.dev) return;

  // Module setup code is loaded by Node once per process, not by Vite: watch
  // it separately and restart Nuxt (a fresh process) when it changes.
  nuxt.hook("vite:serverCreated", (server, { isClient }) => {
    if (!isClient) return;
    const files = new Map();
    for (const [dir, name] of state.packages) {
      for (const file of setupFiles(join(dir, "src"))) {
        files.set(file, `${name}/${relative(dir, file)}`);
      }
    }
    server.watcher.add([...files.keys()]);
    server.watcher.on("change", (file) => {
      if (!files.has(file)) return;
      logger.info(`${files.get(file)} changed, restarting Nuxt`);
      void nuxt.callHook("restart", { hard: true });
    });
  });
}

/** Source files outside `src/runtime`: the module entry and what it imports. */
function setupFiles(src) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir === src && entry.name === "runtime") continue;
        walk(path);
      } else if (/\.[cm]?ts$/.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  if (existsSync(src)) walk(src);
  return files;
}

function escapeRE(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Node resolution, without loading anything: walks up from the package root. */
function isInstalled(name) {
  for (let dir = root; ; dir = dirname(dir)) {
    if (
      basename(dir) !== "node_modules" &&
      existsSync(join(dir, "node_modules", name, "package.json"))
    ) {
      return true;
    }
    if (dirname(dir) === dir) return false;
  }
}

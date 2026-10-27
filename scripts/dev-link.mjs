#!/usr/bin/env node
// Links this workspace's packages into an app that installed `mapomodule`
// from the registry, so local changes show up live in that app.
//
// A `link:`/`file:` dependency or `pnpm link` is not enough: the linked
// package would resolve its own dependencies from THIS repo's node_modules,
// bringing a second copy of vue, nuxt, pinia and vue-i18n into the app
// (broken injections and stores) and, when the app runs in a Linux
// container, macOS-only native binaries.
//
// Instead the app keeps its own install, and every installed copy of a
// workspace package is overlaid with the local sources:
//   - `src/` becomes a copy of the local `src/`, kept in sync while watching;
//   - `dist/` becomes stubs that load `src/`: jiti for the Nuxt module entry
//     (see dev-link-runtime.mjs), plain re-exports for the other entries,
//     and `dist/runtime` -> `../src/runtime`;
//   - the published `dist/` and `src/` are moved to `.mapo-dev-link/` inside
//     the package, and `--restore` moves them back.
// Everything stays inside the app's node_modules: imports resolve against the
// app's own dependencies, and an app directory bind-mounted into a container
// sees the changes there too.
//
// Usage, from the repository root:
//   pnpm dev:link <app> [<app>...]            link, then keep syncing
//   pnpm dev:link <app> [<app>...] --once     link without watching
//   pnpm dev:link <app> [<app>...] --restore  put the published packages back
//   pnpm dev:link <app> [<app>...] --status   show what is linked
// <app> is the Nuxt app directory, or a project root with one such app below.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  watch,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(REPO, "scripts", "dev-link-runtime.mjs");
/** Inside each linked package: the published `dist`/`src` and `link.json`. */
const STATE_DIR = ".mapo-dev-link";
/** Tests, mocks and editor temp files never reach the app. */
const SKIPPED =
  /(^|[\\/])(__tests__|__mocks__|node_modules|\.DS_Store)([\\/]|$)|\.(test|spec)\.[cm]?[jt]sx?$|___jb_(tmp|old)___$|~$|\.sw[px]$/;

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const inputs = args.filter((arg) => !arg.startsWith("--"));
const mode = flags.has("--restore")
  ? "restore"
  : flags.has("--status")
    ? "status"
    : flags.has("--once")
      ? "once"
      : "watch";

if (flags.has("--help") || inputs.length === 0) {
  console.log(
    [
      "Usage: pnpm dev:link <app> [<app>...] [--once | --restore | --status]",
      "",
      "Overlays the mapomodule packages installed in <app> with this workspace's",
      "sources and keeps them in sync until stopped (Ctrl+C keeps the link).",
      "<app> is the Nuxt app directory or a project root containing it.",
      "",
      "  --once     link without watching",
      "  --restore  put the published packages back",
      "  --status   show what is linked",
    ].join("\n"),
  );
  process.exit(inputs.length === 0 && !flags.has("--help") ? 1 : 0);
}

const locals = localPackages();
const apps = inputs.map(resolveApp);

if (mode === "restore") {
  for (const app of apps) restoreApp(app);
} else if (mode === "status") {
  for (const app of apps) printStatus(app);
} else {
  for (const app of apps) linkApp(app);
  console.log(
    "\nRestart the apps' Nuxt dev server once to load the linked modules" +
      " (Docker: e.g. `docker compose restart mapo`).",
  );
  if (mode === "watch") watchSources();
  else console.log("Run again after editing, or drop --once to keep syncing.");
}

// ─── Workspace and app discovery ─────────────────────────────────────────────

function localPackages() {
  const dirs = [join(REPO, "packages", "mapomodule")];
  const scope = join(REPO, "packages", "@mapomodule");
  for (const name of readdirSync(scope)) dirs.push(join(scope, name));

  const packages = new Map();
  for (const dir of dirs) {
    if (!existsSync(join(dir, "package.json")) || !existsSync(join(dir, "src")))
      continue;
    const pkg = readJson(join(dir, "package.json"));
    packages.set(pkg.name, { name: pkg.name, dir, pkg });
  }
  return packages;
}

function resolveApp(input) {
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), input);
  if (!existsSync(dir)) fail(`${dir} does not exist`);
  if (dir === REPO || dir.startsWith(REPO + sep))
    fail(`${dir} is inside this workspace, which already uses local packages`);

  let app = dir;
  if (!usesMapo(dir)) {
    // A project root: look for the app one level down (e.g. `backoffice/`).
    const found = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !/^(\.|node_modules$)/.test(e.name))
      .map((e) => join(dir, e.name))
      .filter(usesMapo);
    if (found.length !== 1) {
      fail(
        found.length
          ? `${dir} contains several Mapo apps, pass one of: ${found.join(", ")}`
          : `${dir} does not depend on mapomodule`,
      );
    }
    app = found[0];
  }
  if (mode !== "status" && !existsSync(join(app, "node_modules")))
    fail(
      `${app} has no node_modules: install its dependencies first` +
        " (with Docker, start its dev container once)",
    );
  return { dir: app, name: relative(dirname(dirname(app)), app) };
}

function usesMapo(dir) {
  if (!existsSync(join(dir, "package.json"))) return false;
  const pkg = readJson(join(dir, "package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(deps).some(
    (name) => name === "mapomodule" || name.startsWith("@mapomodule/"),
  );
}

/**
 * Every real directory of a workspace package installed in the app: pnpm's
 * `.pnpm/<id>/node_modules/<name>`, npm/yarn top-level and nested copies.
 * Symlinks are skipped, they point at a real copy found elsewhere.
 */
function installedCopies(app) {
  const copies = [];
  const visit = (nodeModules) => {
    let entries;
    try {
      entries = readdirSync(nodeModules, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(nodeModules, entry.name);
      if (entry.name === ".pnpm" && entry.isDirectory()) {
        for (const id of readdirSync(path, { withFileTypes: true })) {
          if (id.isDirectory() && id.name !== "node_modules")
            visit(join(path, id.name, "node_modules"));
        }
      } else if (entry.name.startsWith("@") && entry.isDirectory()) {
        for (const scoped of readdirSync(path, { withFileTypes: true }))
          consider(`${entry.name}/${scoped.name}`, join(path, scoped.name), scoped);
      } else if (!entry.name.startsWith(".")) {
        consider(entry.name, path, entry);
      }
    }
  };
  const consider = (name, dir, entry) => {
    if (!entry.isDirectory()) return;
    if (locals.has(name)) copies.push({ name, dir, local: locals.get(name) });
    visit(join(dir, "node_modules"));
  };
  visit(join(app.dir, "node_modules"));
  return copies;
}

// ─── Link ────────────────────────────────────────────────────────────────────

function linkApp(app) {
  app.copies = installedCopies(app);
  if (app.copies.length === 0) fail(`No mapomodule packages installed in ${app.dir}`);

  const linked = [...new Set(app.copies.map((copy) => copy.name))].sort();
  app.link = { linked, source: REPO };

  console.log(`\nLinked into ${app.dir}:`);
  for (const copy of app.copies) {
    linkCopy(app, copy);
    const version = readJson(join(copy.dir, STATE_DIR, "link.json")).version;
    console.log(`  ${copy.name.padEnd(22)} ${version} -> local`);
    const missing = missingDependencies(copy);
    if (missing.length) {
      console.warn(
        `  ! local ${copy.name} needs ${missing.join(", ")}, not installed in the app:` +
          " install it there (temporarily) or update mapomodule",
      );
    }
  }
  const notInstalled = [...locals.keys()].filter((name) => !linked.includes(name));
  if (notInstalled.length)
    console.log(`  not installed in the app, skipped: ${notInstalled.join(", ")}`);
}

function linkCopy(app, copy) {
  const state = join(copy.dir, STATE_DIR);
  if (!existsSync(join(state, "link.json"))) {
    // Move, never rewrite, the published files: with pnpm they are hard links
    // into the content-addressable store shared by every project.
    mkdirSync(state, { recursive: true });
    for (const entry of ["dist", "src"]) {
      const path = join(copy.dir, entry);
      if (existsSync(path) && !existsSync(join(state, entry)))
        renameSync(path, join(state, entry));
    }
    const { version } = readJson(join(copy.dir, "package.json"));
    writeJson(join(state, "link.json"), { version, linkedAt: new Date().toISOString() });
  }
  syncTree(join(copy.local.dir, "src"), join(copy.dir, "src"));
  writeDist(app, copy);
  syncManifest(copy);
}

/** Local runtime dependencies that the app's install cannot resolve. */
function missingDependencies(copy) {
  return Object.entries(copy.local.pkg.dependencies ?? {})
    .filter(([name, range]) => !range.startsWith("workspace:") && !resolvable(name, copy.dir))
    .map(([name]) => name);
}

function resolvable(name, from) {
  for (let dir = from; dirname(dir) !== dir; dir = dirname(dir)) {
    if (
      basename(dir) !== "node_modules" &&
      existsSync(join(dir, "node_modules", name, "package.json"))
    )
      return true;
  }
  return false;
}

// ─── dist stubs ──────────────────────────────────────────────────────────────

/** Writes `dist/` for every `./dist/*` target of the local package.json. */
function writeDist(app, copy) {
  const { local } = copy;
  const dist = join(copy.dir, "dist");
  mkdirSync(dist, { recursive: true });
  const keep = new Set(["dev-link.mjs", "dev-link.json"]);

  copyIfChanged(RUNTIME, join(dist, "dev-link.mjs"));
  writeIfChanged(
    join(dist, "dev-link.json"),
    JSON.stringify({ name: copy.name, ...app.link }, null, 2) + "\n",
  );

  for (const target of distTargets(local.pkg)) {
    const rel = target.slice("./dist/".length);
    if (rel.includes("*")) {
      // `./dist/runtime/*.js` (deep imports): link the directory to src.
      const sub = rel.slice(0, rel.indexOf("*")).replace(/\/$/, "");
      if (!sub || !existsSync(join(local.dir, "src", sub))) continue;
      const link = join(dist, sub);
      ensureSymlink(link, relative(dirname(link), join(copy.dir, "src", sub)));
      keep.add(sub.split("/")[0]);
      continue;
    }
    const source = sourceOf(local, rel);
    if (!source) {
      console.warn(`  ! ${copy.name}: no source for ./dist/${rel}, left out`);
      continue;
    }
    const out = join(dist, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeIfChanged(out, stubFor(copy, rel, source, out));
    keep.add(rel.split("/")[0]);
  }

  // Build metadata from the published dist, not derived from sources.
  for (const file of ["types.d.mts", "module.json"]) {
    const published = join(copy.dir, STATE_DIR, "dist", file);
    if (existsSync(published)) {
      copyIfChanged(published, join(dist, file));
      keep.add(file);
    }
  }
  // @mapomodule/mcp reads its generated knowledge base from dist.
  if (existsSync(join(local.dir, "dist", "knowledge"))) {
    syncTree(join(local.dir, "dist", "knowledge"), join(dist, "knowledge"));
    keep.add("knowledge");
  }

  for (const entry of readdirSync(dist)) {
    if (!keep.has(entry)) rmSync(join(dist, entry), { recursive: true, force: true });
  }
}

function distTargets(pkg) {
  const targets = new Set();
  const collect = (value) => {
    if (typeof value === "string") targets.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  [pkg.exports, pkg.main, pkg.module, pkg.types, pkg.typings].forEach(collect);
  return [...targets].filter((target) => target.startsWith("./dist/"));
}

/** `module.mjs` -> `module.ts`; tsc's `types/index.d.ts` -> `index.ts`. */
function sourceOf(local, rel) {
  const base = rel.replace(/\.d\.[cm]?ts$|\.[cm]?js$/, "");
  const candidates = [base, `${base}/index`];
  if (base.startsWith("types/")) candidates.push(base.slice(6), `${base.slice(6)}/index`);
  for (const candidate of candidates) {
    for (const ext of [".ts", ".mts"]) {
      if (existsSync(join(local.dir, "src", candidate + ext))) return candidate + ext;
    }
  }
  return null;
}

function stubFor(copy, rel, source, out) {
  const file = join(copy.local.dir, "src", source);
  const spec = toSpecifier(relative(dirname(out), join(copy.dir, "src", source)));
  const { names, hasDefault } = exportsOf(file);
  const header = "// Generated by mapo-new `pnpm dev:link`, do not edit.\n";

  if (/\.d\.[cm]?ts$/.test(rel)) {
    // Declarations: TypeScript maps the `.js` specifier back to the source.
    const js = spec.replace(/\.m?ts$/, ".js");
    return (
      header +
      `export * from "${js}";\n` +
      (hasDefault ? `export { default } from "${js}";\n` : "")
    );
  }

  if (/export\s+default\s+defineNuxtModule\b/.test(stripComments(readFileSync(file, "utf8")))) {
    // A Nuxt module entry is imported by Node at build time, where TypeScript
    // only loads through jiti. Named exports must be static in ESM.
    const helper = toSpecifier(relative(dirname(out), join(copy.dir, "dist", "dev-link.mjs")));
    return (
      header +
      `import { importSource, wrapModule } from "${helper}";\n\n` +
      `const _module = await importSource(import.meta.url, "${spec}");\n\n` +
      "export default wrapModule(_module?.default ?? _module);\n" +
      [...names].map((name) => `export const ${name} = _module.${name};\n`).join("")
    );
  }

  // Any other entry can reach the browser: plain ESM that Vite transforms.
  return (
    header +
    `export * from "${spec}";\n` +
    (hasDefault ? `export { default } from "${spec}";\n` : "")
  );
}

/**
 * Value exports of a TypeScript module, statically: `export { a, b as c }`,
 * `export const|function|class|enum x`, `export default`, and relative
 * `export * from` (followed). Type-only exports are skipped.
 */
function exportsOf(file, seen = new Set()) {
  const names = new Set();
  let hasDefault = false;
  if (seen.has(file)) return { names, hasDefault };
  seen.add(file);

  const code = stripComments(readFileSync(file, "utf8"));
  for (const [, list] of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const specifier of list.split(",")) {
      const item = specifier.trim();
      if (!item || /^type\s/.test(item)) continue;
      const name = item.split(/\s+as\s+/).pop().trim();
      if (name === "default") hasDefault = true;
      else names.add(name);
    }
  }
  const declaration =
    /export\s+(?:async\s+)?(?:abstract\s+)?(const\s+enum|const|let|var|function\s*\*?|class|enum)\s+([\w$]+)/g;
  for (const [, kind, name] of code.matchAll(declaration)) {
    if (!kind.startsWith("const ")) names.add(name);
  }
  if (/export\s+default\b/.test(code)) hasDefault = true;
  for (const [, from] of code.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
    if (!from.startsWith(".")) continue;
    const base = resolve(dirname(file), from).replace(/\.[cm]?js$/, "");
    const target = [".ts", ".mts", "/index.ts"]
      .map((ext) => base + ext)
      .find((path) => existsSync(path));
    if (target) exportsOf(target, seen).names.forEach((name) => names.add(name));
  }
  return { names, hasDefault };
}

/** Drops comments, leaving string literals alone (`"**\/*.vue"` is no comment). */
function stripComments(code) {
  let out = "";
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 1;
      out += " ";
    } else if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== char) j += code[j] === "\\" ? 2 : 1;
      out += code.slice(i, j + 1);
      i = j;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Keeps package.json as installed (version, dependencies) unless the local
 * entry points differ, in which case those fields come from the workspace.
 */
function syncManifest(copy) {
  const fields = ["type", "exports", "main", "module", "types", "typings"];
  const backup = join(copy.dir, STATE_DIR, "package.json");
  const installed = readJson(existsSync(backup) ? backup : join(copy.dir, "package.json"));
  const differs = fields.some(
    (field) => JSON.stringify(installed[field]) !== JSON.stringify(copy.local.pkg[field]),
  );
  if (!differs) {
    if (existsSync(backup)) restoreFile(backup, join(copy.dir, "package.json"));
    return;
  }
  // Same hard-link caveat as dist/src: move the original, write a new file.
  if (!existsSync(backup)) renameSync(join(copy.dir, "package.json"), backup);
  const manifest = { ...installed };
  for (const field of fields) manifest[field] = copy.local.pkg[field];
  writeIfChanged(join(copy.dir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
}

// ─── Watch ───────────────────────────────────────────────────────────────────

function watchSources() {
  const pending = new Map();
  let timer;

  const queue = (local, rel) => {
    if (rel !== null && SKIPPED.test(rel)) return;
    if (!pending.has(local)) pending.set(local, new Set());
    pending.get(local).add(rel);
    clearTimeout(timer);
    timer = setTimeout(flush, 80);
  };

  const flush = () => {
    const batch = [...pending];
    pending.clear();
    for (const [local, paths] of batch) {
      const targets = apps.flatMap((app) =>
        app.copies.filter((copy) => copy.local === local).map((copy) => ({ app, copy })),
      );
      if (paths.has("package.json")) {
        local.pkg = readJson(join(local.dir, "package.json"));
      }
      const changed = new Set();
      for (const { app, copy } of targets) {
        for (const rel of paths) {
          if (rel === "package.json") continue;
          if (rel === null) {
            if (syncTree(join(local.dir, "src"), join(copy.dir, "src")))
              changed.add("src/");
          } else if (syncEntry(join(local.dir, "src", rel), join(copy.dir, "src", rel))) {
            changed.add(`src/${rel}`);
          }
        }
        writeDist(app, copy);
        syncManifest(copy);
      }
      for (const path of changed) log(`${local.name}/${path}`);
    }
  };

  for (const local of locals.values()) {
    if (!apps.some((app) => app.copies.some((copy) => copy.local === local))) continue;
    watch(join(local.dir, "src"), { recursive: true }, (_event, filename) =>
      queue(local, filename ? String(filename) : null),
    );
    watch(join(local.dir, "package.json"), () => queue(local, "package.json"));
  }

  // A reinstall in the app (e.g. on container start) replaces linked copies
  // with published ones: link them again.
  setInterval(() => {
    for (const app of apps) {
      if (app.copies.every((copy) => existsSync(join(copy.dir, STATE_DIR, "link.json"))))
        continue;
      log(`${app.name}: packages were reinstalled, linking again`);
      linkApp(app);
      console.log("Restart the app's Nuxt dev server to load them.");
    }
  }, 3000);

  console.log(
    "\nWatching packages/*/src: runtime edits hot-reload, module setup edits" +
      " restart Nuxt.\nCtrl+C stops syncing, the link stays until" +
      " `pnpm dev:link <app> --restore`.",
  );
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  console.log(`[dev-link ${time}] ${message}`);
}

// ─── Restore and status ──────────────────────────────────────────────────────

function restoreApp(app) {
  const copies = installedCopies(app).filter((copy) =>
    existsSync(join(copy.dir, STATE_DIR)),
  );
  if (copies.length === 0) {
    console.log(`${app.dir}: nothing linked`);
    return;
  }
  for (const copy of copies) {
    const state = join(copy.dir, STATE_DIR);
    for (const entry of ["dist", "src"]) {
      rmSync(join(copy.dir, entry), { recursive: true, force: true });
      if (existsSync(join(state, entry))) renameSync(join(state, entry), join(copy.dir, entry));
    }
    if (existsSync(join(state, "package.json")))
      restoreFile(join(state, "package.json"), join(copy.dir, "package.json"));
    rmSync(state, { recursive: true, force: true });
  }
  console.log(
    `${app.dir}: restored ${copies.length} published package(s).` +
      " Restart its Nuxt dev server.",
  );
}

function printStatus(app) {
  const copies = existsSync(join(app.dir, "node_modules")) ? installedCopies(app) : [];
  console.log(`${app.dir}:`);
  if (copies.length === 0) console.log("  no mapomodule packages installed");
  for (const copy of copies) {
    const info = join(copy.dir, STATE_DIR, "link.json");
    const { version } = readJson(existsSync(info) ? info : join(copy.dir, "package.json"));
    const state = existsSync(info)
      ? `linked since ${readJson(info).linkedAt}`
      : "published";
    console.log(`  ${copy.name.padEnd(22)} ${version.padEnd(16)} ${state}`);
  }
}

// ─── File helpers ────────────────────────────────────────────────────────────

/** Mirrors `from` into `to`; returns the number of files written or removed. */
function syncTree(from, to) {
  let changed = 0;
  mkdirSync(to, { recursive: true });
  const wanted = new Set();
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (SKIPPED.test(entry.name)) continue;
    wanted.add(entry.name);
    if (entry.isDirectory()) changed += syncTree(join(from, entry.name), join(to, entry.name));
    else if (entry.isFile() && copyIfChanged(join(from, entry.name), join(to, entry.name)))
      changed++;
  }
  for (const entry of readdirSync(to)) {
    if (wanted.has(entry)) continue;
    rmSync(join(to, entry), { recursive: true, force: true });
    changed++;
  }
  return changed;
}

/** Syncs one path reported by the watcher; returns whether anything changed. */
function syncEntry(from, to) {
  let stats;
  try {
    stats = statSync(from);
  } catch {
    if (!existsSync(to)) return false;
    rmSync(to, { recursive: true, force: true });
    return true;
  }
  if (stats.isDirectory()) return syncTree(from, to) > 0;
  mkdirSync(dirname(to), { recursive: true });
  return copyIfChanged(from, to);
}

/**
 * Copies unless the target already has the same content, then carries the
 * mtime over so the next check is a stat. Unchanged files are never touched:
 * a running dev server would see every write as an edit.
 */
function copyIfChanged(from, to) {
  const source = statSync(from);
  let target;
  try {
    target = lstatSync(to);
  } catch {
    // Missing: copied below.
  }
  if (
    target?.isFile() &&
    target.size === source.size &&
    (Math.abs(target.mtimeMs - source.mtimeMs) < 1 ||
      readFileSync(to).equals(readFileSync(from)))
  )
    return false;
  if (target && !target.isFile()) rmSync(to, { recursive: true, force: true });
  copyFileSync(from, to);
  utimesSync(to, source.atime, source.mtime);
  return true;
}

function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  // A fresh file, never an in-place write: see the hard-link note in linkCopy.
  rmSync(path, { force: true });
  writeFileSync(path, content);
  return true;
}

function ensureSymlink(path, target) {
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() && readlinkSync(path) === target) return;
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Missing: created below.
  }
  symlinkSync(target, path);
}

function restoreFile(backup, path) {
  rmSync(path, { force: true });
  renameSync(backup, path);
}

/** A relative import specifier, always starting with `./` or `../`. */
function toSpecifier(path) {
  const posix = path.split(sep).join("/");
  return posix.startsWith(".") ? posix : `./${posix}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function fail(message) {
  console.error(`dev-link: ${message}`);
  process.exit(1);
}


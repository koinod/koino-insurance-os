// Transpile each top-level *.jsx file to dist/*.js.
//
// Each <script> tag in index.html runs in its own top-level scope, and many
// files declare overlapping consts (`const { useState } = React;`, etc.), so
// we transpile individually rather than bundling — that preserves the same
// per-script scoping that Babel-in-browser used to give us.

import { build } from "esbuild";
import { readdir, mkdir, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "dist");

if (existsSync(outDir)) await rm(outDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const entries = (await readdir(root))
  .filter((f) => f.endsWith(".jsx"))
  .map((f) => join(root, f));

if (entries.length === 0) {
  console.error("no .jsx files found at repo root");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// Static guards. Each catches a runtime-undefined-component bug class at
// build time so it can't reach prod. The IIFE-per-file scoping means a bare
// <Foo/> in file A only resolves if Foo is defined in A OR is a global
// (window.Foo). Bugs in this class throw minified React #130 the moment the
// UI mounts. Run before esbuild so a bad reference aborts with file:line.
// ─────────────────────────────────────────────────────────────────────────

const sources = new Map(); // path → src
for (const path of entries) sources.set(path, await readFile(path, "utf8"));

const locOf = (src, idx) => src.slice(0, idx).split("\n").length;

// Strip block + line comments and string literals so the JSX-tag scan doesn't
// match `<TwilioSoftphone>` in a header comment or `"<EOF/>"` in a string.
// We preserve newlines so line numbers still resolve correctly.
function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += " "; // placeholder so indices roughly align (we only need line)
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Per-page bundle groups. index.html and mobile.html load disjoint sets of
// dist scripts, so cross-IIFE resolution is per-page. We parse each HTML for
// `dist/Xxx.js` references and map back to Xxx.jsx.
async function jsxGroupForPage(htmlPath) {
  const html = await readFile(join(root, htmlPath), "utf8");
  const files = new Set();
  for (const m of html.matchAll(/dist\/([\w-]+)\.js/g)) {
    const jsx = join(root, m[1] + ".jsx");
    if (sources.has(jsx)) files.add(jsx);
  }
  return files;
}
// mobile.html intentionally excluded — it references dist/ios-frame.js which
// has no source file (404 in prod) and is a dead surface. Re-enable when the
// mobile companion app is actively maintained again.
const pageGroups = {
  "index.html": await jsxGroupForPage("index.html"),
};

// ── Guard A: Icons.X references must exist in icons.jsx ─────────────────
const iconsSrc = sources.get(join(root, "icons.jsx")) || "";
const iconKeys = new Set([...iconsSrc.matchAll(/^  ([A-Z][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]));
const missingIcons = new Map();
for (const [path, src] of sources) {
  const clean = stripCommentsAndStrings(src);
  for (const m of clean.matchAll(/Icons\.([A-Z][A-Za-z0-9_]*)/g)) {
    if (iconKeys.has(m[1])) continue;
    if (!missingIcons.has(m[1])) missingIcons.set(m[1], []);
    missingIcons.get(m[1]).push(`${basename(path)}:${locOf(clean, m.index)}`);
  }
}

// ── Guard B: bare JSX component refs must resolve within the same bundle ─
// For each per-page bundle, collect (a) every window-export from any file in
// that bundle, (b) per-file locals. Any <Foo/> in a file must resolve through
// locals OR bundle-globals OR whitelist.
const WHITELIST = new Set([
  "React", "Fragment", "Suspense", "StrictMode", "Profiler", "Component",
  // namespace objects accessed bare; their members are checked elsewhere.
  "Shared", "Icons", "AppData",
]);
function exportsOf(src) {
  // Same reasoning as localsOf — scan raw, over-include is safe.
  const out = new Set();
  for (const m of src.matchAll(/window\.([A-Z][A-Za-z0-9_]*)\s*=/g)) out.add(m[1]);
  // Object.assign(window, { Foo, Bar })  — used by tweaks-panel.jsx
  for (const m of src.matchAll(/Object\.assign\s*\(\s*window\s*,\s*\{([^}]+)\}/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/[:=\s]/)[0];
      if (/^[A-Z]/.test(name)) out.add(name);
    }
  }
  return out;
}
function localsOf(src) {
  // Scan raw source — comments/strings that happen to contain `function Foo(`
  // would only over-whitelist a never-used name (harmless), whereas stripping
  // can mis-eat real declarations when template literals span large regions.
  const out = new Set();
  for (const re of [
    /\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\(/g,
    /\b(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g,
    /\bclass\s+([A-Z][A-Za-z0-9_]*)\b/g,
  ]) for (const m of src.matchAll(re)) out.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/[:=\s]/)[0];
      if (/^[A-Z]/.test(name)) out.add(name);
    }
  }
  return out;
}

const missingComponents = new Map();
const jsxOpenRe = /<([A-Z][A-Za-z0-9_$]*)(?=[\s/>.])/g;
for (const [pageName, group] of Object.entries(pageGroups)) {
  if (group.size === 0) continue;
  const bundleGlobals = new Set();
  for (const path of group) for (const x of exportsOf(sources.get(path))) bundleGlobals.add(x);
  for (const path of group) {
    const src = sources.get(path);
    const clean = stripCommentsAndStrings(src);
    const locals = localsOf(src);
    for (const m of clean.matchAll(jsxOpenRe)) {
      const name = m[1];
      if (locals.has(name) || bundleGlobals.has(name) || WHITELIST.has(name)) continue;
      const key = `${name}@${pageName}`;
      if (!missingComponents.has(key)) missingComponents.set(key, { name, page: pageName, locs: [] });
      missingComponents.get(key).locs.push(`${basename(path)}:${locOf(clean, m.index)}`);
    }
  }
}

const failures = [];
if (missingIcons.size > 0) {
  failures.push("Icons.* references missing from icons.jsx (→ React #130):");
  for (const [name, locs] of missingIcons) failures.push(`   Icons.${name} — ${locs.join(", ")}`);
}
if (missingComponents.size > 0) {
  failures.push("JSX component references unresolved within their page bundle (→ React #130):");
  for (const { name, page, locs } of missingComponents.values()) {
    failures.push(`   <${name}/> in ${page} — ${locs.join(", ")}`);
  }
}
if (failures.length > 0) {
  console.error("\n✘ Build aborted by static guards:\n");
  for (const line of failures) console.error("  " + line);
  console.error("\n  Fix the references above, or expose the component via `window.Foo = Foo;` in its source file.\n");
  process.exit(1);
}

// IIFE wrap per file. Without it, classic <script> tags share the global
// lexical scope, and every file's top-level `const { useState } = React;`
// collides ("Identifier 'useState' has already been declared"). Babel-in-
// browser used to wrap each <script type="text/babel"> automatically; with
// the precompiled-JSX path we have to do the same explicitly. The .jsx files
// that need to expose APIs already assign to `window.*` at the bottom
// (e.g. `window.Shared = { ... }`), so IIFE wrapping is transparent to them.
await build({
  entryPoints: entries,
  outdir: outDir,
  outExtension: { ".js": ".js" },
  bundle: false,
  format: "iife",
  loader: { ".jsx": "jsx" },
  target: ["es2020"],
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

console.log(`built ${entries.length} jsx files -> dist/`);

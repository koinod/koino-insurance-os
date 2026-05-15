// Transpile each top-level *.jsx file to dist/*.js.
//
// Each <script> tag in index.html runs in its own top-level scope, and many
// files declare overlapping consts (`const { useState } = React;`, etc.), so
// we transpile individually rather than bundling — that preserves the same
// per-script scoping that Babel-in-browser used to give us.

import { build } from "esbuild";
import { readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "dist");

// Don't `rm -rf dist/` — Vercel re-runs this script in parallel with
// asset collection, and a delete window causes ENOENT during deploy.
// esbuild overwrites individual outputs cleanly; stale files left over
// from a renamed source are an acceptable trade for race-free deploys.
await mkdir(outDir, { recursive: true });

const entries = (await readdir(root))
  .filter((f) => f.endsWith(".jsx"))
  .map((f) => join(root, f));

if (entries.length === 0) {
  console.error("no .jsx files found at repo root");
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

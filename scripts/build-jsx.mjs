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

if (existsSync(outDir)) await rm(outDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const entries = (await readdir(root))
  .filter((f) => f.endsWith(".jsx"))
  .map((f) => join(root, f));

if (entries.length === 0) {
  console.error("no .jsx files found at repo root");
  process.exit(1);
}

// No `format` set: with `bundle: false`, esbuild emits a plain transpile —
// no IIFE wrapper — which preserves the classic <script>-tag global scope
// that these files were originally written against (function/const at top
// level become page-level globals, just like Babel-in-browser used to give us).
await build({
  entryPoints: entries,
  outdir: outDir,
  outExtension: { ".js": ".js" },
  bundle: false,
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
